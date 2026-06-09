import { spawn } from "node:child_process";
import { request as httpRequest } from "node:http";
import { stableCommandHash, } from "@notch-ai-monitor/local-manager-mock";
function defaultClock() {
    return new Date().toISOString();
}
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function sanitizeToken(value) {
    return value.toLowerCase().replaceAll(/[^a-z0-9]+/g, "_").replaceAll(/^_+|_+$/g, "") || "unknown";
}
function stableToken(prefix, value) {
    return stableCommandHash(value).replace(/^cmd_/, `${prefix}_`);
}
function envForProfile(profile) {
    if (!profile.envAllowlist)
        return process.env;
    const env = {};
    for (const key of profile.envAllowlist) {
        const value = process.env[key];
        if (value !== undefined)
            env[key] = value;
    }
    return env;
}
function sessionForRetry(request, sessionId, processId, now) {
    const session = {
        id: sessionId,
        tool: request.session.tool,
        name: request.session.name,
        mark: request.session.mark,
        source: request.session.source,
        state: "running",
        since: now,
        lastActiveAt: now,
        muted: false,
        sourceMode: "live",
        cwd: request.launchProfile.cwd,
        processId,
    };
    if (request.session.project)
        session.project = request.session.project;
    return session;
}
function endStateForExit(exitCode, signal) {
    if (exitCode === 0) {
        return {
            state: "completed",
            exitCode,
        };
    }
    if (exitCode !== null) {
        return {
            state: "failed",
            exitCode,
            endReason: `exitCode:${exitCode}`,
        };
    }
    return {
        state: "failed",
        ...(signal ? { endReason: `signal:${signal}` } : {}),
    };
}
export class LocalProcessSupervisor {
    clock;
    onSessionEnded;
    onProcessActionCompleted;
    childrenBySessionId = new Map();
    childrenByRunId = new Map();
    adapterControlsBySessionId = new Map();
    pendingTerminateBySessionId = new Map();
    constructor(options = {}) {
        this.clock = options.clock ?? defaultClock;
        this.onSessionEnded = options.onSessionEnded;
        this.onProcessActionCompleted = options.onProcessActionCompleted;
    }
    registerAdapterControl(input) {
        this.adapterControlsBySessionId.set(input.sessionId, { ...input });
    }
    handleSessionEnded(sessionId, end) {
        const pending = this.pendingTerminateBySessionId.get(sessionId);
        if (!pending)
            return;
        this.pendingTerminateBySessionId.delete(sessionId);
        const reason = end.endReason ?? (end.exitCode !== undefined ? `exitCode:${end.exitCode}` : undefined);
        this.onProcessActionCompleted?.({
            requestId: pending.requestId,
            eventId: pending.eventId,
            sessionId,
            actionId: pending.actionId,
            status: "completed",
            message: "graceful stop 已完成，原事件已自动解除",
            completedAt: this.clock(),
            target: pending.completionTarget,
            resolution: "terminate_graceful_completed",
            ...(reason ? { reason } : {}),
        });
    }
    startRetry(request) {
        const executable = request.launchProfile.executable;
        if (!executable) {
            return {
                status: "failed",
                message: "启动配置缺少可执行文件，无法真实重试",
                error: {
                    code: "retry_executable_missing",
                    message: "Retry launch profile executable is required for the local process supervisor.",
                },
            };
        }
        const now = this.clock();
        const sessionId = `sess_retry_${sanitizeToken(request.session.id)}_${sanitizeToken(request.requestId)}`;
        const runId = stableToken("run", JSON.stringify({
            requestId: request.requestId,
            sessionId,
            commandHash: request.launchProfile.commandHash,
            startedAt: now,
        }));
        const supervisorTokenHash = stableToken("supervisor", JSON.stringify({
            runId,
            sessionId,
            launchProfileHash: request.launchProfile.launchProfileHash,
            commandHash: request.launchProfile.commandHash,
        }));
        let child;
        try {
            child = spawn(executable, [...(request.launchProfile.args ?? [])], {
                cwd: request.launchProfile.cwd,
                env: envForProfile(request.launchProfile),
                shell: false,
                stdio: "ignore",
            });
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return {
                status: "failed",
                message: "真实重试进程启动失败",
                error: {
                    code: "retry_spawn_failed",
                    message,
                },
            };
        }
        const owned = {
            child,
            sessionId,
            runId,
            launchProfileHash: request.launchProfile.launchProfileHash,
            supervisorTokenHash,
            processStartedAt: now,
            ...(child.pid !== undefined ? { pid: child.pid } : {}),
        };
        this.childrenBySessionId.set(sessionId, owned);
        this.childrenByRunId.set(runId, owned);
        child.once("error", (error) => {
            owned.errorMessage = error.message;
        });
        child.once("close", (exitCode, signal) => {
            owned.exitCode = exitCode;
            owned.signal = signal;
            this.onSessionEnded?.(sessionId, endStateForExit(exitCode, signal));
        });
        if (child.pid === undefined) {
            return {
                status: "failed",
                message: "真实重试进程未返回 PID",
                error: {
                    code: "retry_spawn_missing_pid",
                    message: "Child process did not expose a pid.",
                },
            };
        }
        const retrySession = sessionForRetry(request, sessionId, child.pid, now);
        const retryLaunchProfile = {
            sessionId,
            adapterId: request.launchProfile.adapterId,
            cwd: request.launchProfile.cwd,
            command: request.launchProfile.command,
            launchProfileHash: request.launchProfile.launchProfileHash,
            ...(request.launchProfile.source ? { source: request.launchProfile.source } : {}),
            executable,
            commandHash: request.launchProfile.commandHash,
            ...(request.launchProfile.args ? { args: [...request.launchProfile.args] } : {}),
            ...(request.launchProfile.envAllowlist
                ? { envAllowlist: [...request.launchProfile.envAllowlist] }
                : {}),
            capabilities: request.launchProfile.capabilities,
            riskReplayMode: request.launchProfile.riskReplayMode,
        };
        const processOwnership = {
            sessionId,
            runId,
            adapterId: request.launchProfile.adapterId,
            cwd: request.launchProfile.cwd,
            launchProfileHash: request.launchProfile.launchProfileHash,
            supervisorTokenHash,
            pid: child.pid,
            processStartedAt: now,
            commandHash: request.launchProfile.commandHash,
            capabilities: request.launchProfile.capabilities,
        };
        return {
            status: "completed",
            message: "已通过本地 supervisor 启动重试",
            target: `session:${sessionId}`,
            session: retrySession,
            retryLaunchProfile,
            processOwnership,
        };
    }
    terminateGracefully(request) {
        const owned = this.childrenBySessionId.get(request.session.id);
        if (!owned || owned.runId !== request.ownership.runId) {
            const adapterControl = this.adapterControlsBySessionId.get(request.session.id);
            if (adapterControl &&
                adapterControl.runId === request.ownership.runId &&
                adapterControl.launchProfileHash === request.ownership.launchProfileHash &&
                adapterControl.supervisorTokenHash === request.ownership.supervisorTokenHash) {
                this.rememberPendingTerminate(request, `session:${request.session.id}#adapter-graceful-stop-completed`, `session:${request.session.id}#adapter-graceful-stop-failed`);
                this.requestAdapterGracefulStop(adapterControl, request);
                return {
                    status: "accepted",
                    message: "已向 adapter 控制通道发送 graceful stop 请求",
                    target: `session:${request.session.id}#adapter-graceful-stop-requested`,
                };
            }
            return {
                status: "failed",
                message: "当前 supervisor 没有该会话的子进程句柄或 adapter 控制通道，无法安全终止",
                error: {
                    code: "graceful_process_not_owned_by_supervisor",
                    message: "The local process supervisor only stops child processes it started or adapter controls registered in this runtime.",
                },
            };
        }
        if (owned.exitCode !== undefined || owned.signal !== undefined) {
            return {
                status: "completed",
                message: "进程已经结束",
                target: `session:${request.session.id}#already-ended`,
                endSession: endStateForExit(owned.exitCode ?? null, owned.signal ?? null),
            };
        }
        const accepted = owned.child.kill("SIGTERM");
        if (!accepted) {
            return {
                status: "failed",
                message: "无法向归属子进程发送 graceful stop 请求",
                target: `session:${request.session.id}#terminate-failed`,
                error: {
                    code: "graceful_stop_failed",
                    message: "Child process rejected the graceful stop request.",
                },
            };
        }
        this.rememberPendingTerminate(request, `session:${request.session.id}#graceful-stop-completed`, `session:${request.session.id}#graceful-stop-failed`);
        return {
            status: "accepted",
            message: "已向归属子进程发送 graceful stop 请求",
            target: `session:${request.session.id}#graceful-stop-requested`,
        };
    }
    close() {
        for (const owned of this.childrenByRunId.values()) {
            if (owned.exitCode !== undefined || owned.signal !== undefined)
                continue;
            owned.child.kill("SIGTERM");
        }
    }
    requestAdapterGracefulStop(control, request) {
        const endpoint = new URL(control.endpoint);
        const body = JSON.stringify({
            requestId: request.requestId,
            sessionId: request.session.id,
            runId: request.ownership.runId,
            launchProfileHash: request.ownership.launchProfileHash,
            actionId: request.actionId,
            requestedAt: request.requestedAt,
        });
        const req = httpRequest(endpoint, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${control.token}`,
                "Content-Type": "application/json",
                "Content-Length": Buffer.byteLength(body).toString(),
            },
        }, (res) => {
            const chunks = [];
            let totalBytes = 0;
            res.on("data", (chunk) => {
                const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
                totalBytes += buffer.byteLength;
                if (totalBytes <= 64 * 1024)
                    chunks.push(buffer);
            });
            res.on("end", () => {
                const bodyText = Buffer.concat(chunks).toString("utf8");
                const statusCode = res.statusCode ?? 0;
                if (statusCode >= 400 || statusCode === 0) {
                    this.failPendingTerminate(request, "adapter 控制通道拒绝 graceful stop 请求", "adapter_control_rejected", `HTTP ${statusCode}${bodyText ? `: ${bodyText}` : ""}`);
                    return;
                }
                if (!bodyText.trim())
                    return;
                try {
                    const parsed = JSON.parse(bodyText);
                    const failed = this.adapterControlFailureFromPayload(parsed);
                    if (failed) {
                        this.failPendingTerminate(request, "adapter 控制通道返回失败", failed.code, failed.message);
                    }
                }
                catch {
                    // A successful control endpoint is allowed to return non-JSON.
                }
            });
        });
        req.on("error", (error) => {
            this.failPendingTerminate(request, "adapter 控制通道请求失败", "adapter_control_request_failed", error.message);
        });
        req.write(body);
        req.end();
    }
    rememberPendingTerminate(request, completionTarget, failureTarget) {
        this.pendingTerminateBySessionId.set(request.session.id, {
            requestId: request.requestId,
            eventId: request.event.id,
            sessionId: request.session.id,
            runId: request.ownership.runId,
            actionId: "terminate",
            requestedAt: request.requestedAt,
            completionTarget,
            failureTarget,
        });
    }
    failPendingTerminate(request, message, errorCode, reason) {
        const pending = this.pendingTerminateBySessionId.get(request.session.id);
        if (!pending || pending.requestId !== request.requestId)
            return;
        this.pendingTerminateBySessionId.delete(request.session.id);
        this.onProcessActionCompleted?.({
            requestId: pending.requestId,
            eventId: pending.eventId,
            sessionId: pending.sessionId,
            actionId: pending.actionId,
            status: "failed",
            message,
            completedAt: this.clock(),
            target: pending.failureTarget,
            reason,
            errorCode,
        });
    }
    adapterControlFailureFromPayload(value) {
        if (!isRecord(value))
            return null;
        if (value.ok === false) {
            const error = isRecord(value.error) ? value.error : null;
            return {
                code: typeof error?.code === "string" ? error.code : "adapter_control_rejected",
                message: typeof error?.message === "string" ? error.message : "Adapter control returned ok=false.",
            };
        }
        if (value.status === "failed" || value.status === "rejected") {
            return {
                code: "adapter_control_rejected",
                message: `Adapter control returned status=${String(value.status)}.`,
            };
        }
        return null;
    }
}
