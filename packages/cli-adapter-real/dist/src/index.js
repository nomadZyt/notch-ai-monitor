import { execFile, spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { createServer, request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import path from "node:path";
import { createInterface } from "node:readline";
import { promisify } from "node:util";
import { URL } from "node:url";
const execFileAsync = promisify(execFile);
export const DEFAULT_LOCAL_MANAGER_URL = "http://127.0.0.1:4317";
export const DEFAULT_PROFILE_ID = "custom";
export const SOURCE_PROFILES = {
    "codex-cli": {
        id: "codex-cli",
        tool: "codex",
        name: "Codex CLI",
        mark: "CX",
        source: "Terminal",
    },
    "claude-code-cli": {
        id: "claude-code-cli",
        tool: "claude",
        name: "Claude Code CLI",
        mark: "CL",
        source: "Terminal",
    },
    "qwen-cli": {
        id: "qwen-cli",
        tool: "qwen",
        name: "Qwen CLI",
        mark: "QW",
        source: "Terminal",
    },
    "cursor-app": {
        id: "cursor-app",
        tool: "custom",
        name: "Cursor",
        mark: "CU",
        source: "Cursor App",
    },
    "codex-app": {
        id: "codex-app",
        tool: "codex",
        name: "Codex App",
        mark: "CX",
        source: "Codex App",
    },
    custom: {
        id: "custom",
        tool: "custom",
        name: "Custom CLI",
        mark: "AI",
        source: "Terminal",
    },
};
const REAL_ADAPTER_MODES = ["scan", "stdin", "emit", "wrapper"];
let generatedMessageCount = 0;
let generatedEventCount = 0;
function nextMessageId() {
    generatedMessageCount += 1;
    return `real_cli_msg_${generatedMessageCount.toString().padStart(4, "0")}`;
}
function nextEventSequence() {
    generatedEventCount += 1;
    return generatedEventCount;
}
function sanitizeToken(value) {
    return value.toLowerCase().replaceAll(/[^a-z0-9]+/g, "_").replaceAll(/^_+|_+$/g, "") || "unknown";
}
function truncate(value, maxLength = 220) {
    if (value.length <= maxLength)
        return value;
    return `${value.slice(0, maxLength - 3)}...`;
}
function stableStringHash(prefix, value) {
    let hash = 0x811c9dc5;
    for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193);
    }
    return `${prefix}_${(hash >>> 0).toString(16).padStart(8, "0")}`;
}
function hashControlToken(token) {
    return `supervisor_${createHash("sha256").update(token).digest("hex").slice(0, 16)}`;
}
function quoteCommandArg(value) {
    if (/^[a-zA-Z0-9_./:=@%+-]+$/.test(value))
        return value;
    return JSON.stringify(value);
}
export function formatLaunchCommand(command, args = []) {
    return [command, ...args].map(quoteCommandArg).join(" ");
}
export function createProcessRegistrationPayload(options) {
    const processStartedAt = options.now ?? new Date().toISOString();
    const command = formatLaunchCommand(options.childCommand, options.childArgs);
    const commandHash = stableStringHash("cmd", command);
    const launchProfileHash = stableStringHash("launch", JSON.stringify({
        adapterId: `cli-adapter-real:${options.profile.id}`,
        cwd: options.cwd,
        command,
        args: options.childArgs,
        commandHash,
    }));
    const runId = stableStringHash("run", JSON.stringify({
        sessionId: options.session.id,
        pid: options.childProcessId ?? null,
        processStartedAt,
        commandHash,
    }));
    const supervisorTokenHash = options.controlToken
        ? hashControlToken(options.controlToken)
        : stableStringHash("supervisor", JSON.stringify({
            sessionId: options.session.id,
            runId,
            launchProfileHash,
            commandHash,
        }));
    const payload = {
        sessionId: options.session.id,
        runId,
        adapterId: `cli-adapter-real:${options.profile.id}`,
        cwd: options.cwd,
        command,
        executable: options.childCommand,
        launchProfileHash,
        supervisorTokenHash,
        commandHash,
        capabilities: ["process.retry", "process.terminate"],
        riskReplayMode: "required",
        processStartedAt,
        source: options.profile.source,
    };
    if (options.childProcessId !== undefined)
        payload.pid = options.childProcessId;
    if (options.childArgs.length > 0)
        payload.args = [...options.childArgs];
    if (options.controlEndpoint && options.controlToken) {
        payload.controlEndpoint = options.controlEndpoint;
        payload.controlToken = options.controlToken;
    }
    return payload;
}
export function resolveSourceProfile(profileId = DEFAULT_PROFILE_ID, overrides = {}) {
    const profile = SOURCE_PROFILES[profileId];
    if (!profile) {
        throw new Error(`Unknown source profile: ${profileId}`);
    }
    return {
        ...profile,
        ...overrides,
    };
}
export function createSession(profile, options = {}) {
    const now = options.now ?? new Date().toISOString();
    const token = sanitizeToken(profile.id);
    const id = options.sessionId ?? `sess_real_${token}_${options.processId ?? "current"}`;
    const session = {
        id,
        tool: profile.tool,
        name: profile.name,
        mark: profile.mark,
        source: profile.source,
        state: options.state ?? "running",
        since: now,
        lastActiveAt: now,
        muted: false,
    };
    const project = options.project ?? (options.cwd ? path.basename(options.cwd) : undefined);
    if (options.sourceMode)
        session.sourceMode = options.sourceMode;
    if (project)
        session.project = project;
    if (options.cwd)
        session.cwd = options.cwd;
    if (options.processId !== undefined)
        session.processId = options.processId;
    return session;
}
export function createEnvelope(event, payload, source, now = new Date().toISOString()) {
    return {
        protocol: "notch-ai-monitor",
        version: 1,
        id: nextMessageId(),
        event,
        ts: now,
        source,
        payload,
    };
}
function protocolSourceFor(profile, session) {
    const source = {
        kind: "cli",
        tool: profile.tool,
        sessionId: session.id,
        name: profile.name,
    };
    if (session.processId !== undefined)
        source.processId = session.processId;
    if (session.sourceMode)
        source.sourceMode = session.sourceMode;
    return source;
}
export function createSessionUpsertEnvelope(session, profile, now = new Date().toISOString()) {
    return createEnvelope("notch.session.upserted", { session }, protocolSourceFor(profile, session), now);
}
export function createEventCreatedEnvelope(event, session, profile, now = new Date().toISOString()) {
    return createEnvelope("notch.event.created", { event }, protocolSourceFor(profile, session), now);
}
export function createSessionEndedEnvelope(session, profile, exitCode, signal, now = new Date().toISOString()) {
    const state = exitCode === 0 ? "completed" : "failed";
    const payload = {
        sessionId: session.id,
        state,
    };
    if (exitCode !== null)
        payload.exitCode = exitCode;
    if (signal) {
        payload.reason = `signal:${signal}`;
    }
    else if (exitCode !== null && exitCode !== 0) {
        payload.reason = `exitCode:${exitCode}`;
    }
    return createEnvelope("notch.session.ended", payload, protocolSourceFor(profile, session), now);
}
function createEventId(type, profile, now, sequence) {
    const timestamp = now.replaceAll(/\D/g, "").slice(0, 14) || "now";
    const suffix = (sequence ?? nextEventSequence()).toString().padStart(4, "0");
    return `evt_real_${sanitizeToken(profile.id)}_${type}_${timestamp}_${suffix}`;
}
export function createEventFromType(type, session, profile, options = {}) {
    const now = options.now ?? new Date().toISOString();
    const command = options.command;
    const message = options.message ?? options.summary ?? command ?? "";
    const event = {
        id: createEventId(type, profile, now, options.sequence),
        sessionId: session.id,
        type,
        title: options.title ?? defaultTitleFor(type),
        summary: options.summary ?? defaultSummaryFor(type, profile, message),
        source: profile.source,
        createdAt: now,
    };
    if (command)
        event.command = command;
    if (type === "confirm") {
        event.evidence = {
            reason: "检测到待确认或高风险命令输出。",
            origin: `${profile.name} output`,
        };
    }
    else if (type === "error") {
        event.evidence = {
            reason: "检测到错误输出。",
            origin: `${profile.name} output`,
            logExcerpt: truncate(message || "error"),
        };
    }
    else if (type === "risk") {
        event.evidence = {
            reason: "真实来源显式上报风险事件。",
            impact: command ? "需要人工确认命令影响范围。" : "需要人工确认影响范围。",
            origin: `${profile.name} emit`,
            rollback: "未由 adapter 执行命令；如外部工具已执行，需要按工具输出回滚。",
            riskLevel: "high",
        };
    }
    return event;
}
function defaultTitleFor(type) {
    switch (type) {
        case "confirm":
            return "需要确认";
        case "result":
            return "结果已就绪";
        case "error":
            return "运行失败";
        case "risk":
            return "风险事件";
    }
}
function defaultSummaryFor(type, profile, message) {
    if (message.length > 0)
        return truncate(message);
    switch (type) {
        case "confirm":
            return `${profile.name} 输出了一条需要确认的命令。`;
        case "result":
            return `${profile.name} 已输出完成或结果就绪信号。`;
        case "error":
            return `${profile.name} 输出了错误信号。`;
        case "risk":
            return `${profile.name} 上报了风险信号。`;
    }
}
const DANGEROUS_COMMAND_PATTERNS = [
    /\brm\s+-[^\n]*[rf][^\n]*\//i,
    /\bgit\s+clean\s+-[^\n]*[fd]/i,
    /\bsudo\s+/i,
    /\bchmod\s+-R\b/i,
    /\bchown\s+-R\b/i,
    /\bdd\s+if=/i,
    /\bmkfs(?:\.[a-z0-9]+)?\b/i,
    /\bdiskutil\s+erase/i,
    /\bformat\s+[a-z]:/i,
    /\bdel\s+\/[sfq]/i,
    /\bRemove-Item\b[^\n]*\b-Recurse\b/i,
];
const CONFIRM_PATTERNS = [
    /\bapproval\b/i,
    /\bapprove\b/i,
    /\bconfirm(?:ation)?\b/i,
    /\bpermission\b/i,
    /\ballow\b/i,
    /\bproceed\b/i,
    /\bdo you want to\b/i,
    /\bwaiting for approval\b/i,
    /\bneeds approval\b/i,
    /\brequires approval\b/i,
    /\brequires confirmation\b/i,
    /需要确认/,
    /待批准/,
    /批准/,
    /确认运行/,
    /是否执行/,
    /允许执行/,
];
const ERROR_PATTERNS = [
    /\berror\b/i,
    /\bfailed\b/i,
    /\bfailure\b/i,
    /\bexception\b/i,
    /\btraceback\b/i,
    /\bpanic\b/i,
    /\bfatal\b/i,
    /\bstack trace\b/i,
    /错误/,
    /失败/,
    /异常/,
];
const RESULT_PATTERNS = [
    /\bdone\b/i,
    /\bcompleted\b/i,
    /\bsuccess\b/i,
    /\bsucceeded\b/i,
    /\bresult ready\b/i,
    /\bfinished\b/i,
    /完成/,
    /成功/,
    /结果已就绪/,
];
export function extractCommandFromLine(line) {
    const trimmed = line.trim();
    const backtick = trimmed.match(/`([^`]+)`/);
    if (backtick?.[1])
        return backtick[1].trim();
    const labelMatch = trimmed.match(/(?:command|cmd|run|execute|exec|执行命令|命令)\s*[:：]\s*(.+)$/i);
    if (labelMatch?.[1])
        return labelMatch[1].trim();
    const promptMatch = trimmed.match(/(?:^|\s)(?:\$|>)\s+(.+)$/);
    if (promptMatch?.[1])
        return promptMatch[1].trim();
    return trimmed;
}
export function classifyOutputLine(line) {
    const trimmed = line.trim();
    if (trimmed.length === 0)
        return null;
    const dangerous = DANGEROUS_COMMAND_PATTERNS.some((pattern) => pattern.test(trimmed));
    const needsConfirmation = CONFIRM_PATTERNS.some((pattern) => pattern.test(trimmed));
    if (dangerous || needsConfirmation) {
        return {
            type: "confirm",
            command: extractCommandFromLine(trimmed),
            summary: truncate(trimmed),
            evidenceReason: dangerous
                ? "检测到高风险命令文本，等待 manager/risk-policy 进一步升级。"
                : "检测到待批准或确认语义。",
        };
    }
    if (ERROR_PATTERNS.some((pattern) => pattern.test(trimmed))) {
        return {
            type: "error",
            summary: truncate(trimmed),
            logExcerpt: truncate(trimmed),
        };
    }
    if (RESULT_PATTERNS.some((pattern) => pattern.test(trimmed))) {
        return {
            type: "result",
            summary: truncate(trimmed),
        };
    }
    return null;
}
function hasAnyPattern(line, patterns) {
    return patterns.some((pattern) => pattern.test(line));
}
function parsedConfirmEvent(line, command, evidenceReason) {
    const parsed = {
        type: "confirm",
        summary: truncate(line),
        evidenceReason,
    };
    if (command)
        parsed.command = command;
    return parsed;
}
function parsedErrorEvent(line) {
    return {
        type: "error",
        summary: truncate(line),
        logExcerpt: truncate(line),
    };
}
function parsedResultEvent(line) {
    return {
        type: "result",
        summary: truncate(line),
    };
}
function cleanCommandCandidate(value) {
    return value
        .trim()
        .replace(/^[`"']|[`"']$/g, "")
        .replace(/^(?:\$|>)\s+/, "")
        .trim();
}
function extractCommandFromStructuredToolLine(line) {
    const jsonCommand = line.match(/["']command["']\s*:\s*["']([^"']+)["']/i);
    if (jsonCommand?.[1])
        return cleanCommandCandidate(jsonCommand[1]);
    const bashLabel = line.match(/\bBash\s*[:：]\s*(.+)$/i);
    if (bashLabel?.[1])
        return cleanCommandCandidate(bashLabel[1]);
    const bashCall = line.match(/\bBash\s*\(\s*(?:command\s*[:=]\s*)?[`"']?([^`"')]+)[`"']?\s*\)/i);
    if (bashCall?.[1])
        return cleanCommandCandidate(bashCall[1]);
    return undefined;
}
function extractProfileCommandFromLine(line) {
    const structuredCommand = extractCommandFromStructuredToolLine(line);
    if (structuredCommand)
        return structuredCommand;
    const genericCommand = extractCommandFromLine(line);
    if (genericCommand !== line.trim())
        return cleanCommandCandidate(genericCommand);
    const profileLabelMatch = line.match(/(?:proposed|suggested|run|running|execute|executing|requesting approval(?:\s+to\s+run)?|waiting for approval|approval requested|command needing approval|permission required(?:\s+to\s+run)?|do you want to proceed\?)\s*[:：]\s*(.+)$/i);
    if (profileLabelMatch?.[1])
        return cleanCommandCandidate(profileLabelMatch[1]);
    const approvalPromptMatch = line.match(/(?:permission required(?:\s+to\s+run)?|do you want to proceed\?)\s*[:：]?\s*(.+)$/i);
    if (approvalPromptMatch?.[1])
        return cleanCommandCandidate(approvalPromptMatch[1]);
    return cleanCommandCandidate(line);
}
const CODEX_CONFIRM_PATTERNS = [
    /^(?:\[[^\]]+\]\s*)?(?:proposed|suggested)\s+(?:command|cmd|shell command)\s*[:：]/i,
    /^(?:\[[^\]]+\]\s*)?(?:run|running|execute|executing)\s+(?:command|cmd|shell command)\s*[:：]/i,
    /^(?:\[[^\]]+\]\s*)?(?:requesting approval|waiting for approval|approval requested)\b/i,
];
const CODEX_ERROR_PATTERNS = [
    /^(?:\[[^\]]+\]\s*)?(?:error|failed|exception|fatal)\b\s*[:：.-]?/i,
    /\b(?:error|failed|exception|fatal)\b/i,
];
const CODEX_RESULT_PATTERNS = [
    /^(?:\[[^\]]+\]\s*)?(?:completed|done|result(?: ready)?|success|succeeded)\b\s*[:：.-]?/i,
];
function classifyCodexCliOutputLine(line) {
    if (hasAnyPattern(line, CODEX_ERROR_PATTERNS))
        return parsedErrorEvent(line);
    if (hasAnyPattern(line, CODEX_RESULT_PATTERNS))
        return parsedResultEvent(line);
    if (hasAnyPattern(line, CODEX_CONFIRM_PATTERNS)) {
        return parsedConfirmEvent(line, extractProfileCommandFromLine(line), "Codex CLI 输出包含命令建议、执行或审批请求。");
    }
    return null;
}
const CLAUDE_CONFIRM_PATTERNS = [
    /\bBash\s*(?:\(|[:：])/i,
    /\btool use\b.*\bBash\b/i,
    /\bcommand needing approval\b/i,
    /\bcommand needs approval\b/i,
    /\bpermission required\b/i,
    /\bdo you want to proceed\??\b/i,
];
const CLAUDE_ERROR_PATTERNS = [
    /^(?:\[[^\]]+\]\s*)?(?:error|failed|traceback)\b\s*[:：.-]?/i,
    /\bpermission denied\b/i,
    /\b(?:error|failed|traceback)\b/i,
];
const CLAUDE_RESULT_PATTERNS = [
    /^(?:\[[^\]]+\]\s*)?(?:task completed|completed|done|result ready|success|succeeded)\b\s*[:：.-]?/i,
];
function classifyClaudeCodeCliOutputLine(line) {
    if (hasAnyPattern(line, CLAUDE_ERROR_PATTERNS))
        return parsedErrorEvent(line);
    if (hasAnyPattern(line, CLAUDE_RESULT_PATTERNS))
        return parsedResultEvent(line);
    if (hasAnyPattern(line, CLAUDE_CONFIRM_PATTERNS)) {
        return parsedConfirmEvent(line, extractProfileCommandFromLine(line), "Claude Code CLI 输出包含 Bash/tool use 或权限确认请求。");
    }
    return null;
}
export function classifyOutputLineForProfile(line, profileOrId) {
    const trimmed = line.trim();
    if (trimmed.length === 0)
        return null;
    const profileId = typeof profileOrId === "string" ? profileOrId : profileOrId.id;
    if (profileId === "codex-cli") {
        return classifyCodexCliOutputLine(trimmed) ?? classifyOutputLine(trimmed);
    }
    if (profileId === "claude-code-cli") {
        return classifyClaudeCodeCliOutputLine(trimmed) ?? classifyOutputLine(trimmed);
    }
    return classifyOutputLine(trimmed);
}
export function createEventFromLine(line, session, profile, options = {}) {
    const parsed = classifyOutputLineForProfile(line, profile);
    if (!parsed)
        return null;
    const eventOptions = {
        summary: parsed.summary,
        message: parsed.logExcerpt ?? parsed.summary,
    };
    if (options.now)
        eventOptions.now = options.now;
    if (options.sequence !== undefined)
        eventOptions.sequence = options.sequence;
    if (parsed.command)
        eventOptions.command = parsed.command;
    const event = createEventFromType(parsed.type, session, profile, eventOptions);
    if (parsed.type === "confirm" && event.evidence && parsed.evidenceReason) {
        event.evidence.reason = parsed.evidenceReason;
    }
    if (parsed.type === "error" && event.evidence && parsed.logExcerpt) {
        event.evidence.logExcerpt = parsed.logExcerpt;
    }
    return event;
}
export function parsePsLine(line) {
    const match = line.match(/^\s*(\d+)\s+(.+?)\s*$/);
    if (!match?.[1] || !match[2])
        return null;
    return {
        pid: Number(match[1]),
        command: match[2].trim(),
    };
}
function firstCommandToken(command) {
    const trimmed = command.trim();
    if (trimmed.startsWith("\"") || trimmed.startsWith("'")) {
        const quote = trimmed[0];
        const end = trimmed.indexOf(quote, 1);
        return end > 0 ? trimmed.slice(1, end) : trimmed.slice(1);
    }
    return trimmed.split(/\s+/)[0] ?? "";
}
function basenameWithoutNodeSuffix(value) {
    return path.basename(value).replace(/\.(?:js|mjs|cjs)$/i, "");
}
function commandTokenIncludes(command, pattern) {
    return pattern.test(firstCommandToken(command));
}
function isCursorAppMainProcess(command) {
    return commandTokenIncludes(command, /\/Cursor\.app\/Contents\/MacOS\/Cursor$/);
}
function isCodexAppMainProcess(command) {
    return commandTokenIncludes(command, /\/Codex\.app\/Contents\/MacOS\/Codex$/);
}
function isCodexCliProcess(command, executable) {
    if (executable !== "codex")
        return false;
    if (/\/Codex\.app\//.test(command) && /\bapp-server\b/.test(command))
        return false;
    return true;
}
export function detectProfileIdFromCommand(command) {
    const executable = basenameWithoutNodeSuffix(firstCommandToken(command));
    if (isCursorAppMainProcess(command)) {
        return "cursor-app";
    }
    if (isCodexAppMainProcess(command)) {
        return "codex-app";
    }
    if (isCodexCliProcess(command, executable)) {
        return "codex-cli";
    }
    if (executable === "claude") {
        return "claude-code-cli";
    }
    if (executable === "qwen") {
        return "qwen-cli";
    }
    return null;
}
export function parsePsOutput(output) {
    const discovered = [];
    const seen = new Set();
    for (const line of output.split(/\r?\n/)) {
        const parsed = parsePsLine(line);
        if (!parsed)
            continue;
        const profileId = detectProfileIdFromCommand(parsed.command);
        if (!profileId)
            continue;
        const key = `${profileId}:${parsed.pid}`;
        if (seen.has(key))
            continue;
        seen.add(key);
        discovered.push({
            ...parsed,
            profileId,
            profile: resolveSourceProfile(profileId),
        });
    }
    return discovered;
}
export async function scanRunningProcesses() {
    const { stdout } = await execFileAsync("ps", ["-axo", "pid=,command="], {
        maxBuffer: 1024 * 1024,
    });
    return parsePsOutput(stdout);
}
async function postJson(baseUrl, pathname, payload) {
    const url = new URL(pathname, baseUrl);
    const body = JSON.stringify(payload);
    const transport = url.protocol === "https:" ? httpsRequest : httpRequest;
    return new Promise((resolve, reject) => {
        const req = transport(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Content-Length": Buffer.byteLength(body).toString(),
            },
        }, (res) => {
            const chunks = [];
            res.on("data", (chunk) => {
                chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
            });
            res.on("end", () => {
                const text = Buffer.concat(chunks).toString("utf8");
                const parsed = text.length > 0 ? JSON.parse(text) : undefined;
                if ((res.statusCode ?? 500) >= 400) {
                    reject(new Error(`POST ${url.href} failed with ${res.statusCode}: ${text}`));
                    return;
                }
                resolve(parsed);
            });
        });
        req.on("error", reject);
        req.write(body);
        req.end();
    });
}
export async function postEnvelope(baseUrl, envelope) {
    return postJson(baseUrl, "/v1/envelopes", envelope);
}
export async function postProcessRegistration(baseUrl, registration) {
    return postJson(baseUrl, "/v1/process/registrations", registration);
}
async function readRequestJson(req) {
    const chunks = [];
    for await (const chunk of req) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const text = Buffer.concat(chunks).toString("utf8");
    if (text.trim().length === 0)
        return {};
    return JSON.parse(text);
}
function writeControlJson(res, status, body) {
    res.writeHead(status, {
        "Content-Type": "application/json; charset=utf-8",
    });
    res.end(JSON.stringify(body));
}
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function childHasEnded(child) {
    return child.exitCode !== null || child.signalCode !== null;
}
export async function createWrapperControlServer(input) {
    const token = randomBytes(32).toString("base64url");
    let expected = null;
    const server = createServer((req, res) => {
        void (async () => {
            const url = new URL(req.url ?? "/", "http://127.0.0.1");
            if (req.method !== "POST" || url.pathname !== "/v1/control/terminate-gracefully") {
                writeControlJson(res, 404, { ok: false, error: { code: "not_found" } });
                return;
            }
            if (req.headers.authorization !== `Bearer ${token}`) {
                writeControlJson(res, 401, { ok: false, error: { code: "invalid_control_token" } });
                return;
            }
            if (!expected) {
                writeControlJson(res, 409, { ok: false, error: { code: "control_not_ready" } });
                return;
            }
            const body = await readRequestJson(req);
            const record = isRecord(body) ? body : {};
            if (record.sessionId !== input.sessionId ||
                record.runId !== expected.runId ||
                record.launchProfileHash !== expected.launchProfileHash) {
                writeControlJson(res, 409, { ok: false, error: { code: "control_target_mismatch" } });
                return;
            }
            if (childHasEnded(input.child)) {
                writeControlJson(res, 200, {
                    ok: true,
                    status: "completed",
                    message: "Child process already ended.",
                });
                return;
            }
            const accepted = input.child.kill("SIGTERM");
            if (!accepted) {
                writeControlJson(res, 500, {
                    ok: false,
                    status: "failed",
                    error: { code: "graceful_stop_failed" },
                });
                return;
            }
            writeControlJson(res, 202, {
                ok: true,
                status: "accepted",
                message: "Graceful stop requested.",
            });
        })().catch((error) => {
            const message = error instanceof Error ? error.message : String(error);
            writeControlJson(res, 500, {
                ok: false,
                status: "failed",
                error: { code: "control_internal_error", message },
            });
        });
    });
    await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", () => {
            server.off("error", reject);
            resolve();
        });
    });
    const address = server.address();
    if (!address || typeof address === "string") {
        await new Promise((resolve) => server.close(() => resolve()));
        throw new Error("Unable to bind wrapper control server.");
    }
    return {
        endpoint: `http://127.0.0.1:${address.port}/v1/control/terminate-gracefully`,
        token,
        setExpectedRegistration(nextExpected) {
            expected = { ...nextExpected };
        },
        close() {
            return new Promise((resolve, reject) => {
                server.close((error) => {
                    if (error) {
                        reject(error);
                        return;
                    }
                    resolve();
                });
            });
        },
    };
}
export async function sendEnvelopeSequence(baseUrl, envelopes) {
    const responses = [];
    for (const envelope of envelopes) {
        responses.push(await postEnvelope(baseUrl, envelope));
    }
    return responses;
}
function parseEventType(value) {
    if (["risk", "confirm", "result", "error"].includes(value))
        return value;
    throw new Error("Event type must be one of: risk, confirm, result, error.");
}
function isRealAdapterMode(value) {
    return REAL_ADAPTER_MODES.includes(value);
}
function parseProfileId(value) {
    if (Object.hasOwn(SOURCE_PROFILES, value))
        return value;
    throw new Error("Profile must be one of: codex-cli, claude-code-cli, qwen-cli, cursor-app, codex-app, custom.");
}
function parseSourceMode(value) {
    if (["mock", "fixture", "wrapper", "scan", "live"].includes(value))
        return value;
    throw new Error("Source mode must be one of: mock, fixture, wrapper, scan, live.");
}
function parseWrapperStdioMode(value) {
    if (["capture", "inherit"].includes(value))
        return value;
    throw new Error("Stdio mode must be one of: capture, inherit.");
}
export function parseCliArgs(argv) {
    const separatorIndex = argv.indexOf("--");
    const adapterArgs = separatorIndex >= 0 ? argv.slice(0, separatorIndex) : argv;
    const childCommandArgs = separatorIndex >= 0 ? argv.slice(separatorIndex + 1) : [];
    const options = {
        mode: "emit",
        baseUrl: process.env.NOTCH_LOCAL_MANAGER_URL ?? DEFAULT_LOCAL_MANAGER_URL,
        profileId: DEFAULT_PROFILE_ID,
        childArgs: [],
    };
    let consumedMode = false;
    for (let index = 0; index < adapterArgs.length; index += 1) {
        const arg = adapterArgs[index];
        const next = adapterArgs[index + 1];
        if (!consumedMode && isRealAdapterMode(arg)) {
            options.mode = arg;
            consumedMode = true;
        }
        else if (arg === "--mode" && next) {
            if (!isRealAdapterMode(next)) {
                throw new Error("Mode must be one of: scan, stdin, emit, wrapper.");
            }
            options.mode = next;
            consumedMode = true;
            index += 1;
        }
        else if (arg === "--url" && next) {
            options.baseUrl = next;
            index += 1;
        }
        else if (arg === "--profile" && next) {
            options.profileId = parseProfileId(next);
            index += 1;
        }
        else if (arg === "--session-id" && next) {
            options.sessionId = next;
            index += 1;
        }
        else if (arg === "--cwd" && next) {
            options.cwd = next;
            index += 1;
        }
        else if (arg === "--project" && next) {
            options.project = next;
            index += 1;
        }
        else if (arg === "--pid" && next) {
            options.processId = Number(next);
            index += 1;
        }
        else if (arg === "--type" && next) {
            options.type = parseEventType(next);
            index += 1;
        }
        else if (arg === "--command" && next) {
            options.command = next;
            index += 1;
        }
        else if (arg === "--summary" && next) {
            options.summary = next;
            index += 1;
        }
        else if (arg === "--title" && next) {
            options.title = next;
            index += 1;
        }
        else if (arg === "--message" && next) {
            options.message = next;
            index += 1;
        }
        else if (arg === "--name" && next) {
            options.name = next;
            index += 1;
        }
        else if (arg === "--mark" && next) {
            options.mark = next;
            index += 1;
        }
        else if (arg === "--source" && next) {
            options.source = next;
            index += 1;
        }
        else if (arg === "--source-mode" && next) {
            options.sourceMode = parseSourceMode(next);
            index += 1;
        }
        else if (arg === "--stdio" && next) {
            options.stdioMode = parseWrapperStdioMode(next);
            index += 1;
        }
        else {
            throw new Error(`Unknown argument: ${arg}`);
        }
    }
    if (!isRealAdapterMode(options.mode)) {
        throw new Error("Mode must be one of: scan, stdin, emit, wrapper.");
    }
    if (options.processId !== undefined && !Number.isFinite(options.processId)) {
        throw new Error("--pid must be a number.");
    }
    if (options.mode === "wrapper") {
        if (childCommandArgs.length === 0) {
            throw new Error("Wrapper mode requires a child command after --.");
        }
        options.childCommand = childCommandArgs[0];
        options.childArgs = childCommandArgs.slice(1);
    }
    else if (childCommandArgs.length > 0) {
        throw new Error("Child command arguments after -- are only supported in wrapper mode.");
    }
    return options;
}
function createCliSession(options, profile) {
    const sessionOptions = {
        processId: options.processId ?? process.pid,
        cwd: options.cwd ?? process.cwd(),
        sourceMode: options.sourceMode ?? (options.mode === "emit" ? "fixture" : "live"),
        state: "running",
    };
    if (options.sessionId)
        sessionOptions.sessionId = options.sessionId;
    if (options.project)
        sessionOptions.project = options.project;
    return createSession(profile, sessionOptions);
}
function profileOverridesFromOptions(options) {
    const overrides = {};
    if (options.name)
        overrides.name = options.name;
    if (options.mark)
        overrides.mark = options.mark;
    if (options.source)
        overrides.source = options.source;
    return overrides;
}
function eventOptionsFromCliOptions(options) {
    const eventOptions = {};
    if (options.command)
        eventOptions.command = options.command;
    if (options.summary)
        eventOptions.summary = options.summary;
    if (options.title)
        eventOptions.title = options.title;
    if (options.message)
        eventOptions.message = options.message;
    return eventOptions;
}
function createWrapperSession(options, profile, cwd) {
    const sessionOptions = {
        cwd,
        sourceMode: options.sourceMode ?? "wrapper",
        state: "running",
    };
    if (options.sessionId) {
        sessionOptions.sessionId = options.sessionId;
    }
    else {
        sessionOptions.sessionId = `sess_real_${sanitizeToken(profile.id)}_wrapper_${Date.now().toString(36)}_${process.pid}`;
    }
    if (options.project)
        sessionOptions.project = options.project;
    if (options.processId !== undefined)
        sessionOptions.processId = options.processId;
    return createSession(profile, sessionOptions);
}
function writeChunk(output, chunk) {
    output.write(chunk);
}
function attachLineParser(input, output, onLine) {
    if (!input)
        return Promise.resolve();
    let buffered = "";
    return new Promise((resolve, reject) => {
        input.on("data", (chunk) => {
            writeChunk(output, chunk);
            const text = Buffer.isBuffer(chunk) ? chunk.toString("utf8") : chunk;
            buffered += text;
            const lines = buffered.split(/\r?\n/);
            buffered = lines.pop() ?? "";
            for (const line of lines) {
                onLine(line);
            }
        });
        input.on("end", () => {
            if (buffered.length > 0) {
                onLine(buffered);
                buffered = "";
            }
            resolve();
        });
        input.on("error", reject);
    });
}
async function runScanMode(options) {
    const discovered = await scanRunningProcesses();
    const sentSessionIds = [];
    const envelopes = discovered.map((item) => {
        const session = createSession(item.profile, {
            processId: item.pid,
            sourceMode: options.sourceMode ?? "scan",
            state: "running",
        });
        sentSessionIds.push(session.id);
        return createSessionUpsertEnvelope(session, item.profile);
    });
    const responses = await sendEnvelopeSequence(options.baseUrl, envelopes);
    console.log(JSON.stringify({
        mode: "scan",
        discovered: discovered.length,
        sent: sentSessionIds,
        responses,
    }, null, 2));
}
async function runStdinMode(options, input = process.stdin) {
    const profile = resolveSourceProfile(options.profileId, profileOverridesFromOptions(options));
    const session = createCliSession(options, profile);
    const sessionEnvelope = createSessionUpsertEnvelope(session, profile);
    const sessionResponse = await postEnvelope(options.baseUrl, sessionEnvelope);
    console.log(JSON.stringify({ sent: sessionEnvelope.event, response: sessionResponse }, null, 2));
    const lines = createInterface({
        input,
        crlfDelay: Infinity,
    });
    for await (const line of lines) {
        const event = createEventFromLine(line, session, profile);
        if (!event)
            continue;
        const envelope = createEventCreatedEnvelope(event, session, profile);
        const response = await postEnvelope(options.baseUrl, envelope);
        console.log(JSON.stringify({ sent: envelope.event, type: event.type, response }, null, 2));
    }
}
async function runEmitMode(options) {
    const profile = resolveSourceProfile(options.profileId, profileOverridesFromOptions(options));
    const session = createCliSession(options, profile);
    const type = options.type ?? "confirm";
    const event = createEventFromType(type, session, profile, eventOptionsFromCliOptions(options));
    const envelopes = [
        createSessionUpsertEnvelope(session, profile),
        createEventCreatedEnvelope(event, session, profile),
    ];
    const responses = await sendEnvelopeSequence(options.baseUrl, envelopes);
    console.log(JSON.stringify({
        mode: "emit",
        sent: envelopes.map((envelope) => envelope.event),
        responses,
    }, null, 2));
}
async function runWrapperMode(options) {
    const childCommand = options.childCommand;
    if (!childCommand) {
        throw new Error("Wrapper mode requires a child command after --.");
    }
    const profile = resolveSourceProfile(options.profileId, profileOverridesFromOptions(options));
    const childCwd = path.resolve(options.cwd ?? process.cwd());
    const stdioMode = options.stdioMode ?? "capture";
    const session = createWrapperSession(options, profile, childCwd);
    const sessionEnvelope = createSessionUpsertEnvelope(session, profile);
    const sessionResponse = await postEnvelope(options.baseUrl, sessionEnvelope);
    const sentEventTypes = [];
    const eventResponses = [];
    const eventSendPromises = [];
    let eventSendFailures = 0;
    const queueEventFromLine = (line) => {
        const event = createEventFromLine(line, session, profile);
        if (!event)
            return;
        const envelope = createEventCreatedEnvelope(event, session, profile);
        sentEventTypes.push(event.type);
        eventSendPromises.push(postEnvelope(options.baseUrl, envelope)
            .then((response) => {
            eventResponses.push(response);
        })
            .catch((error) => {
            eventSendFailures += 1;
            const message = error instanceof Error ? error.message : String(error);
            eventResponses.push({ ok: false, error: message });
        }));
    };
    const child = spawn(childCommand, options.childArgs, {
        cwd: childCwd,
        shell: false,
        stdio: stdioMode === "inherit" ? "inherit" : ["inherit", "pipe", "pipe"],
    });
    let wrapperControlServer = null;
    let wrapperControlError = null;
    try {
        wrapperControlServer = await createWrapperControlServer({
            sessionId: session.id,
            child,
        });
    }
    catch (error) {
        wrapperControlError = error instanceof Error ? error.message : String(error);
    }
    const stdoutDone = stdioMode === "capture"
        ? attachLineParser(child.stdout, process.stdout, queueEventFromLine)
        : Promise.resolve();
    const stderrDone = stdioMode === "capture"
        ? attachLineParser(child.stderr, process.stderr, queueEventFromLine)
        : Promise.resolve();
    const processRegistrationPayload = createProcessRegistrationPayload({
        session,
        profile,
        childCommand,
        childArgs: options.childArgs,
        cwd: childCwd,
        ...(child.pid !== undefined ? { childProcessId: child.pid } : {}),
        ...(wrapperControlServer
            ? {
                controlEndpoint: wrapperControlServer.endpoint,
                controlToken: wrapperControlServer.token,
            }
            : {}),
    });
    wrapperControlServer?.setExpectedRegistration({
        runId: processRegistrationPayload.runId,
        launchProfileHash: processRegistrationPayload.launchProfileHash,
    });
    let processRegistrationResponse = null;
    let processRegistrationError = null;
    try {
        processRegistrationResponse = await postProcessRegistration(options.baseUrl, processRegistrationPayload);
    }
    catch (error) {
        processRegistrationError = error instanceof Error ? error.message : String(error);
    }
    const childExit = await new Promise((resolve, reject) => {
        child.once("error", reject);
        child.once("close", (exitCode, signal) => {
            resolve({ exitCode, signal });
        });
    });
    await Promise.all([stdoutDone, stderrDone]);
    await Promise.all(eventSendPromises);
    const sessionEndedEnvelope = createSessionEndedEnvelope(session, profile, childExit.exitCode, childExit.signal);
    const sessionEndedResponse = await postEnvelope(options.baseUrl, sessionEndedEnvelope);
    if (wrapperControlServer) {
        try {
            await wrapperControlServer.close();
        }
        catch (error) {
            wrapperControlError = error instanceof Error ? error.message : String(error);
        }
    }
    const summary = {
        mode: "wrapper",
        profile: options.profileId,
        stdio: stdioMode,
        sessionId: session.id,
        cwd: childCwd,
        command: [childCommand, ...options.childArgs],
        childProcessId: child.pid,
        exitCode: childExit.exitCode,
        signal: childExit.signal,
        sent: {
            session: sessionEnvelope.event,
            sessionEnded: sessionEndedEnvelope.event,
            eventTypes: sentEventTypes,
        },
        responses: {
            session: sessionResponse,
            sessionEnded: sessionEndedResponse,
            events: eventResponses,
        },
        processRegistration: {
            status: processRegistrationError ? "failed" : "registered",
            control: {
                enabled: Boolean(wrapperControlServer),
                error: wrapperControlError,
            },
            request: {
                sessionId: processRegistrationPayload.sessionId,
                runId: processRegistrationPayload.runId,
                launchProfileHash: processRegistrationPayload.launchProfileHash,
                commandHash: processRegistrationPayload.commandHash,
                pid: processRegistrationPayload.pid ?? null,
            },
            response: processRegistrationResponse,
            error: processRegistrationError,
        },
        eventSendFailures,
    };
    console.log(JSON.stringify(summary, null, 2));
    if (childExit.exitCode !== null && childExit.exitCode !== 0) {
        process.exitCode = childExit.exitCode;
    }
    else if (childExit.exitCode === null && childExit.signal) {
        process.exitCode = 1;
    }
    else if (eventSendFailures > 0) {
        process.exitCode = 1;
    }
}
export async function runRealCliAdapter(argv = process.argv.slice(2)) {
    const options = parseCliArgs(argv);
    switch (options.mode) {
        case "scan":
            await runScanMode(options);
            return;
        case "stdin":
            await runStdinMode(options);
            return;
        case "emit":
            await runEmitMode(options);
            return;
        case "wrapper":
            await runWrapperMode(options);
            return;
    }
}
export async function runNotchRun(argv = process.argv.slice(2)) {
    await runRealCliAdapter(["wrapper", "--source-mode", "live", ...argv]);
}
