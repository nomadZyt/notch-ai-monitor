import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import type { ClientRequest, IncomingMessage } from "node:http";
import { URL } from "node:url";

import type { NotchEvent, ProtocolEnvelope, ProtocolSource, Session } from "@notch-ai-monitor/shared";

export const DEFAULT_LOCAL_MANAGER_URL = "http://127.0.0.1:4317";
export const DANGEROUS_CONFIRM_COMMAND = "rm -rf ~/Documents/xhs-drafts/* && git clean -fd";

export type MockCliScenario =
  | "session"
  | "confirm"
  | "risky-confirm"
  | "risk"
  | "result"
  | "error"
  | "all";

export type MockEventInput = Partial<Omit<NotchEvent, "actions">> &
  Pick<NotchEvent, "id" | "sessionId" | "type" | "title" | "summary" | "source" | "createdAt"> & {
    actions?: NotchEvent["actions"];
  };

export interface MockCliSenderOptions {
  baseUrl?: string;
  scenario?: MockCliScenario;
  sessionId?: string;
  now?: string;
}

let generatedMessageCount = 0;

function nextMessageId(): string {
  generatedMessageCount += 1;
  return `mock_cli_msg_${generatedMessageCount.toString().padStart(4, "0")}`;
}

export function createMockSession(options: MockCliSenderOptions = {}): Session {
  const now = options.now ?? new Date().toISOString();
  return {
    id: options.sessionId ?? "sess_mock_cli_001",
    tool: "qwen",
    name: "Qwen CLI Mock",
    mark: "QW",
    source: "Terminal",
    project: "notch-ai-monitor-p1",
    cwd: "/Users/example/notch-ai-monitor",
    processId: 43170,
    state: "waiting",
    since: now,
    lastActiveAt: now,
    muted: false,
  };
}

export function createEnvelope<TEvent extends string, TPayload>(
  event: TEvent,
  payload: TPayload,
  source: ProtocolSource,
  now = new Date().toISOString()
): ProtocolEnvelope<TEvent, TPayload> {
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

function baseEvent(
  type: MockEventInput["type"],
  session: Session,
  now: string,
  idKey: string,
  input: Omit<MockEventInput, "createdAt" | "id" | "sessionId" | "source" | "type">
): MockEventInput {
  return {
    id: `evt_mock_${idKey}_${now.replaceAll(/\D/g, "").slice(0, 14)}`,
    sessionId: session.id,
    type,
    source: "Terminal · mock CLI",
    createdAt: now,
    ...input,
  };
}

export function createExampleEvent(type: Exclude<MockCliScenario, "session" | "all">, session: Session, now: string): MockEventInput {
  switch (type) {
    case "confirm":
      return baseEvent("confirm", session, now, "confirm", {
        title: "需要确认",
        summary: "Mock CLI 想运行一个安全的生成命令。",
        command: "python scripts/prepare_xhs_batch.py --drafts ./drafts --limit 6",
        evidence: {
          reason: "命令读取本地 drafts 目录并生成批处理输出。",
          impact: "./drafts、./outputs/xhs-batch",
          origin: "mock CLI generated command",
          rollback: "删除输出目录即可回滚，不影响源文件。",
        },
      });

    case "risky-confirm":
      return baseEvent("confirm", session, now, "risky_confirm", {
        title: "需要确认",
        summary: "Mock CLI 请求运行清理命令。",
        command: DANGEROUS_CONFIRM_COMMAND,
        evidence: {
          reason: "AI 请求执行草稿清理和 git 工作区清理。",
          impact: "~/Documents/xhs-drafts/* and untracked git files",
          origin: "mock CLI generated command",
          rollback: "从备份或 git 历史恢复，未跟踪文件可能无法恢复。",
        },
      });

    case "risk":
      return baseEvent("risk", session, now, "risk", {
        title: "已拦截危险命令",
        summary: "直接注入的 risk 示例事件。",
        command: "sudo rm -rf ./tmp/generated",
        evidence: {
          reason: "命令包含 sudo 和递归删除。",
          impact: "./tmp/generated",
          origin: "mock CLI direct risk fixture",
          rollback: "从备份恢复被删除内容。",
          riskLevel: "high",
          affectedPaths: ["./tmp/generated"],
        },
      });

    case "result":
      return baseEvent("result", session, now, "result", {
        title: "结果已就绪",
        summary: "Mock CLI 已生成 6 条小红书草稿。",
      });

    case "error":
      return baseEvent("error", session, now, "error", {
        title: "运行失败",
        summary: "Mock CLI 运行脚本时遇到依赖错误。",
        evidence: {
          reason: "本地依赖缺失。",
          origin: "mock CLI stderr",
          logExcerpt: "ModuleNotFoundError: No module named 'yaml'",
        },
      });
  }
}

export function createMockEnvelopeSequence(options: MockCliSenderOptions = {}): ProtocolEnvelope<string, unknown>[] {
  const scenario = options.scenario ?? "risky-confirm";
  const now = options.now ?? new Date().toISOString();
  const session = createMockSession({ ...options, now });
  const source: ProtocolSource = {
    kind: "cli",
    tool: session.tool,
    sessionId: session.id,
    name: "cli-adapter-mock",
  };
  if (session.processId !== undefined) source.processId = session.processId;
  const envelopes: ProtocolEnvelope<string, unknown>[] = [
    createEnvelope("notch.session.upserted", { session }, source, now),
  ];

  if (scenario === "session") return envelopes;

  const eventTypes: Array<Exclude<MockCliScenario, "session" | "all">> =
    scenario === "all" ? ["confirm", "risky-confirm", "risk", "result", "error"] : [scenario];

  for (const eventType of eventTypes) {
    envelopes.push(
      createEnvelope("notch.event.created", { event: createExampleEvent(eventType, session, now) }, source, now)
    );
  }

  return envelopes;
}

export async function postEnvelope(baseUrl: string, envelope: ProtocolEnvelope<string, unknown>): Promise<unknown> {
  const url = new URL("/v1/envelopes", baseUrl);
  const body = JSON.stringify(envelope);
  const transport = url.protocol === "https:" ? httpsRequest : httpRequest;

  return new Promise((resolve, reject) => {
    const req: ClientRequest = transport(
      url,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body).toString(),
        },
      },
      (res: IncomingMessage) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer | string) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          const parsed = text.length > 0 ? (JSON.parse(text) as unknown) : undefined;
          if ((res.statusCode ?? 500) >= 400) {
            reject(new Error(`POST ${url.href} failed with ${res.statusCode}: ${text}`));
            return;
          }
          resolve(parsed);
        });
      }
    );

    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

function parseArgs(argv: string[]): MockCliSenderOptions {
  const options: MockCliSenderOptions = {
    baseUrl: process.env.NOTCH_LOCAL_MANAGER_URL ?? DEFAULT_LOCAL_MANAGER_URL,
    scenario: "risky-confirm",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--url" && next) {
      options.baseUrl = next;
      index += 1;
    } else if (arg === "--session-id" && next) {
      options.sessionId = next;
      index += 1;
    } else if (arg === "--scenario" && next) {
      options.scenario = next as MockCliScenario;
      index += 1;
    } else if (!arg.startsWith("--")) {
      options.scenario = arg as MockCliScenario;
    }
  }

  if (!["session", "confirm", "risky-confirm", "risk", "result", "error", "all"].includes(options.scenario ?? "")) {
    throw new Error("Scenario must be one of: session, confirm, risky-confirm, risk, result, error, all.");
  }

  return options;
}

export async function runMockCliSender(argv: string[] = process.argv.slice(2)): Promise<void> {
  const options = parseArgs(argv);
  const baseUrl = options.baseUrl ?? DEFAULT_LOCAL_MANAGER_URL;
  const envelopes = createMockEnvelopeSequence(options);

  for (const envelope of envelopes) {
    const response = await postEnvelope(baseUrl, envelope);
    console.log(JSON.stringify({ sent: envelope.event, response }, null, 2));
  }
}
