# Main Agent Context Checkpoint P2

更新时间：2026-06-09
Agent：Main Agent
工作目录：`/Users/zhaiyongtao/vibeCoding/notch-ai-monitor`

## 1. 当前总目标

Notch AI Monitor 已完成 P2 beta 主链路与 Tauri Web UI MVP host。当前目标是保持 Desktop/Manager/real CLI adapter 边界稳定，在 Tauri MVP 路线上继续补 artifact smoke、资源打包策略、DMG/安装包、签名公证和升级迁移 QA；SwiftUI/AppKit 仍是 formal host 候选/后续路线。

当前路线事实：

1. P2 beta 已完成：read-only `view-log`、graceful `retry` / `terminate` 合同与实现边界、event history/pending action projection、scheduler/SSE、real-link smoke、Session Hub。
2. P3 当前先实现 Tauri Web UI MVP host：Tauri 启动 app-managed Manager API，并承载顶部小尺寸 WebView surface。
3. Electron active code 已清理；不得恢复 Electron 作为产品宿主、packaging spike 或默认 `.app` 路线。
4. Desktop UI 只消费 Manager snapshot/read-only endpoints，不读取 persistence file、control token，也不直接操作 CLI 进程。

## 2. 主 Agent 流程规则

- P2/P3 小节开始和结束优先更新本 checkpoint。
- P1/P1+ 历史入口保留在 `docs/handoffs/main-agent-context-checkpoint-p1.md`。
- 每个阶段完成后继续写详细 handoff 到 `docs/handoffs/`。
- 改动前先 review 上一步是否有不合理代码或破坏可扩展性。
- 使用 `apply_patch` 编辑文件。
- 保持 Desktop UI 与业务逻辑解耦，Desktop 不直接操作 CLI 进程。

## 3. 已完成前置阶段摘要

- P1 技术 Spike 已完成：真实/模拟 CLI event -> Local Manager API -> EventQueue/StateMachine -> Notch UI -> action envelope。
- P1+ polish 已完成：中文文案、Evidence 标签、本地偏好、ARIA 语义与 QA。
- P1 中 `view-log` 已固定为 read-only/noop，不 resolve event。
- P1 中 `retry` / `terminate` 仍是 mocked process effects；P2.1 不处理它们。
- P2.1 已完成：`view-log` 安全日志目标合同，Manager 返回 read-only filesystem target 或 logExcerpt fallback，Desktop 只展示 action result。
- P2.2 合同设计已完成：`retry` / `terminate` 真实 side effect 必须经过 Manager/adapter/supervisor，包含确认、权限边界、进程归属校验、幂等、审计和失败反馈；当前 runtime 仍保持 mocked。
- P2.2 实现拆分已开始：先做 Manager 内部 process ownership registry 与 fake supervisor tests；默认 runtime 仍保持 mocked，尚不接真实 CLI 进程。
- P2.2b 已开始：先做 `retry` launch profile registry 和 risk policy replay，再接 opt-in retry supervisor；默认 mock runtime 仍不变。
- P2.3 已完成：process action audit、retry launch profile 和 retry risk replay result 已有最小持久化 port 与可选 JSON file store；Desktop 仍只消费 Manager API，不接持久化细节。
- P2.4/P2.5 已完成：real CLI adapter registration/control channel、async action completion、event history/pending action projection、internal scheduler、repeatable real-link smoke 与产品化 Session Hub 均已落地。
- P3 Tauri MVP 已完成本地 `.app` 验证：当前 `package:mac` 指向 `build:tauri-mvp`；Tauri DMG、签名、公证、安装/升级 QA 仍待做。
- Electron active code、scripts 和 generated artifacts 已清理；过期 Electron standalone handoff 在文档整理中删除，废弃原因保留在本 checkpoint、`AGENTS.md` 和 docs index。

## 4. P2.1 工作日志

- 2026-06-08 开始：进入 P2.1 read-only `view-log` 安全日志查看合同。选择新建本 P2 checkpoint，原因是 P2 会持续多个子阶段，继续追加到 P1 checkpoint 会降低可恢复性；P1 checkpoint 只保留 P2 入口指针。
- 2026-06-08 复核：工作目录未找到 `AGENTS.md` 文件，继续遵守用户消息中的 AGENTS 指令：生成内容期间说明做法，不只给结果。已读取 P1 final acceptance、P1 side-effect boundary、P1 read-only view-log smoke、P1+ accessibility handoff。现有 shared/protocol 已有 `ActionResultPayload.effects[].target` 和 `mocked`，P2.1 可优先不扩 shared model/API/protocol，通过 Manager 返回安全日志目标，Desktop 只展示 Manager 结果，不直接读/开文件。
- 2026-06-08 实现开始：本轮最小实现落在 `packages/local-manager-mock` action runtime、合同文档和 QA。`view-log` 将优先从现有 `Evidence.affectedPaths` 里选择安全日志路径并通过 action result message/effect 暴露；没有安全路径时回退为展示 `logExcerpt`。Desktop 不新增文件读取或 OS open 逻辑。
- 2026-06-08 实现结束：新增 `docs/contracts/view-log-p2.md`；`view-log` 专用 result 已在 Manager action runtime 中实现。安全路径命中时返回 `status=noop`、`effects[0].type=filesystem`、`target=<safe path>`、`mocked=false`；无安全路径但有 `logExcerpt` 时返回 `navigation` fallback。已补 local-manager-mock 单测与 Desktop API client smoke。
- 2026-06-08 验证结束：`npm run test -w @notch-ai-monitor/local-manager-mock` 13/13 通过；`npm run build:app -w @notch-ai-monitor/desktop` 通过；`npm run test:qa` 10/10 通过；API 直接验证 `view-log` 返回 `noop`、`filesystem` safe target、`mocked=false` 且 event 保持 active；in-app browser API mode 验证点击 `view-log` 后 live region 显示安全日志路径、`eventCount=1`、console error 0；`npm run smoke:view-log` 通过，确认 P1 fallback smoke 兼容。
- 2026-06-08 收尾准备：P2.1 验证后已调用 `/v1/debug/reset`，当前主 API snapshot 回到空 quiet。当前服务：Local Manager API PID `37390`，Desktop Vite PID `37547`。
- 2026-06-08 收尾结束：已新增 `docs/handoffs/main-agent-view-log-contract-p2.md`。P2.1 完成，下一入口为 P2.2：先设计 `retry` / `terminate` 真实 side effect 合同，尤其确认、权限边界、进程归属校验、失败反馈和审计，不可直接 kill 进程。

## 5. P2.2 工作日志

- 2026-06-08 开始：进入 P2.2 `retry` / `terminate` 真实 side effect 合同设计。当前小节先设计合同，不实现真实进程控制，不接 `retry` / `terminate` runtime side effect。
- 2026-06-08 复核：P2.1 `view-log` 保持 read-only，Desktop 只展示 Manager action result；现有 shared protocol 已有 `accepted`、`failed`、`rejected`、`needs_confirmation` 等状态，可先复用这些状态描述未来异步进程动作。当前 `retry` / `terminate` 在 `local-manager-mock` 仍是 mocked process action；没有发现必须在 P2.2 设计阶段修改 shared model/API/protocol/EventQueue/StateMachine/real CLI adapter 的理由。
- 2026-06-08 设计结束：新增 `docs/contracts/retry-terminate-p2.md`。合同规定 `retry` 只能基于 Manager/adapter 记录的 launch profile 重启；`terminate` 只能对 Manager 归属进程执行 graceful stop，第一次点击必须 `needs_confirmation`，确认后仍要校验 process ownership、capability、幂等和审计。P2.2 不允许 Desktop 直接操作 PID、PTY、Terminal 或任意 CLI 命令。
- 2026-06-08 验证结束：`git diff --check` 通过；`npm run test -w @notch-ai-monitor/local-manager-mock` 13/13 通过；`curl -fsS http://127.0.0.1:4317/health` 返回 ok；`rg` 检查没有新增 `process.kill` 实现，`kill` / `SIGKILL` 只出现在禁止说明里。本轮只改文档和 checkpoint，未运行 Desktop build/QA/browser 点击验证。
- 2026-06-08 收尾结束：已新增 `docs/handoffs/main-agent-retry-terminate-contract-p2.md`。P2.2 合同设计完成，下一步如继续实现，应先做 Manager 内部 process ownership registry 与 fake supervisor tests，再接真实 `retry` / graceful `terminate`。

## 6. P2.2 实现拆分工作日志

- 2026-06-08 开始：按 P2.2 合同后的实现顺序，先做 Manager 内部 process ownership registry 与 fake supervisor tests。目标是为后续真实 `retry` / graceful `terminate` 打底，不让 Desktop 或默认 mock runtime 直接操作真实进程。
- 2026-06-08 复核：现有 `local-manager-mock` 默认 `retry` / `terminate` 行为被 P1 测试锁定为 mocked process effect；本小节将使用显式 opt-in 的 process side effect contract，默认行为不变。`Session` 已有 `sourceMode`、`cwd`、`processId` 字段，可作为归属校验输入；P2.2 仍不需要修改 shared model/API/protocol。
- 2026-06-08 实现结束：`packages/local-manager-mock` 新增 `processSideEffectMode: "supervised"` opt-in、`ProcessOwnershipInput/Record`、`ProcessSupervisor.terminateGracefully()`、内存审计记录和 requestId 幂等 replay。默认 `processSideEffectMode` 仍是 `"mock"`，因此 Desktop/API 默认行为仍保持 mocked；supervised terminate 只通过 fake supervisor 测试路径执行 graceful stop 抽象，不触达真实 OS 进程。
- 2026-06-08 测试阶段：新增 P2 supervised terminate 单测，覆盖未确认只返回 `needs_confirmation`、缺 process ownership 拒绝、确认目标 run mismatch 拒绝、fake supervisor graceful stop 成功且同一 requestId 不重复调用、supervisor failed 时 event 保持 active。`npm run test -w @notch-ai-monitor/local-manager-mock` 17/17 通过。
- 2026-06-08 验证结束：`npm run build:app -w @notch-ai-monitor/desktop` 通过；`npm run test:qa` 10/10 通过；`git diff --check` 通过；`curl -fsS http://127.0.0.1:4317/health` 返回 ok；`rg` 检查没有新增 `process.kill` / `SIGKILL` / `kill -9` 实现，相关字样只出现在合同禁止说明里。
- 2026-06-08 收尾结束：已新增 `docs/handoffs/main-agent-process-ownership-registry-p2.md`。P2.2a 完成，下一入口建议为 `retry` launch profile registry，或继续将 `terminate` supervised path 从 fake supervisor 过渡到 real adapter/supervisor，但仍只能 graceful stop。

## 7. P2.2b Retry Launch Profile 工作日志

- 2026-06-08 开始：进入 `retry` launch profile registry、risk policy replay 与 opt-in retry supervisor。目标是在 Manager 内部先保存可审计 retry 启动配置，并在 retry 前重新运行 risk policy；危险命令必须先生成 risk event，不得直接启动 supervisor。
- 2026-06-08 复核：`risk-policy` 中 `buildRiskEvent()` 对安全命令返回 `undefined`，对危险命令返回 active risk event；可复用于 retry replay。现有 `ActionRequestPayload.input` 可继续承载 `expectedSessionId` / `expectedLaunchProfileHash` 目标回显；本小节仍不需要修改 shared model/API/protocol/EventQueue/StateMachine/real CLI adapter。
- 2026-06-08 实现结束：`packages/local-manager-mock` 新增 `RetryLaunchProfileInput/Record`、`registerRetryLaunchProfile()`、`getRetryLaunchProfile()`、`ProcessSupervisor.startRetry()` 和 supervised retry 分支。retry validation 覆盖 error event、live session、launch profile、cwd、commandHash、capability、active attempt、目标回显和 supervisor 存在性。risk replay 命中危险命令时 enqueue active risk event 并返回 `rejected`，不调用 supervisor；safe retry 成功时 resolution 为 `retry_started`。
- 2026-06-08 测试阶段：新增 P2 supervised retry 单测，覆盖缺 launch profile 拒绝、危险 launch profile replay 生成 risk event 且不调用 supervisor、安全 launch profile 调用 fake supervisor 并 requestId replay、已有 retry attempt 时拒绝。`npm run test -w @notch-ai-monitor/local-manager-mock` 21/21 通过。
- 2026-06-08 验证结束：`npm run build:app -w @notch-ai-monitor/desktop` 通过；`npm run test:qa` 10/10 通过；`git diff --check` 通过；`curl -fsS http://127.0.0.1:4317/health` 返回 ok；`rg` 检查没有新增 `process.kill` / `child_process` / `spawn(` / `exec(` / `SIGKILL` / `kill -9` 实现，相关字样只出现在合同禁止说明里。
- 2026-06-08 收尾结束：已新增 `docs/handoffs/main-agent-retry-launch-profile-p2.md`。P2.2b 完成，下一入口可以是 P2.3 事件历史与持久化，承接内存审计和 launch profile；也可以继续 P2.4 real CLI adapter hardening，让 real adapter 注册 launch profile，但 Desktop 仍不得直接启动 CLI。

## 8. P2.3 Persistence 工作日志

- 2026-06-08 开始：进入 P2.3 持久化切片，目标是让 process action audit、retry launch profile、retry risk replay result 在 Manager 重启后可恢复。实现边界是 mock manager 只定义 storage port，不引入 Node `fs`；Local Manager API 负责可选 JSON file store。
- 2026-06-08 复核：`local-manager-mock` 同时被 Desktop mock mode 打包使用，因此不能直接依赖 Node 文件系统。`local-manager-api` 运行在 Node，可承接实际 JSON 文件持久化。P2.3 仍不需要修改 shared protocol、EventQueue/StateMachine 或 real CLI adapter；Desktop UI 不读取或写入持久化文件。
- 2026-06-08 实现结束：`local-manager-mock` 新增 `ProcessPersistenceStore`、`ProcessPersistenceSnapshot`、`RetryRiskReplayRecord` 和 `getRetryRiskReplayRecords()`；Manager hydrate 时恢复 retry launch profiles、process action audit、retry risk replay records，并在 profile 注册、audit 写入、risk replay、reset、retry attempt active 更新时保存 snapshot。`local-manager-api` 新增 `JsonFileProcessPersistenceStore`、`processPersistenceFile` option、`NOTCH_PROCESS_PERSISTENCE_FILE` env 和 `--process-persistence-file` CLI arg。
- 2026-06-08 测试阶段：新增 mock persistence 单测，验证 launch profile、audit、risk replay records 可跨 manager 实例恢复；新增 API JSON file store 单测，验证 process state records 落盘和 `createLocalManagerApi({ processPersistenceFile })` hydrate。`npm run test -w @notch-ai-monitor/local-manager-mock` 22/22 通过；`npm run test -w @notch-ai-monitor/local-manager-api` 9/9 通过。
- 2026-06-08 验证结束：`npm run build:app -w @notch-ai-monitor/desktop` 通过；`npm run test:qa` 10/10 通过；`git diff --check` 通过；`curl -fsS http://127.0.0.1:4317/health` 返回 ok；`rg` 检查没有新增 `process.kill` / `child_process` / `spawn(` / `exec(` / `SIGKILL` / `kill -9` 实现，相关字样只出现在合同禁止说明里。
- 2026-06-08 收尾结束：已新增 `docs/handoffs/main-agent-process-persistence-p2.md`。P2.3 最小 process persistence 完成，下一入口建议为 P2.4 real CLI adapter hardening：让 real adapter 注册 launch profile/process ownership 并复用持久化 store；Desktop 仍不得直接操作 CLI 进程或持久化文件。

## 9. P2.4 Real CLI Adapter Hardening 工作日志

- 2026-06-08 开始：进入 P2.4，让 real CLI adapter 在 wrapper/notch-run 启动 child 后向 Manager 注册 launch profile 和 process ownership。计划采用 Local Manager API 的最小非 shared-protocol endpoint 承接注册，避免为了内部 Manager metadata 修改 shared protocol envelope。Desktop 不调用该 endpoint，也不直接启动 CLI 或读取持久化文件。
- 2026-06-08 复核：P2.3 已提供 `ProcessPersistenceStore` 和可选 JSON file store；`local-manager-mock` 已有 `registerRetryLaunchProfile()` / `registerProcessOwnership()`。real adapter 目前只发送 session/event/session-ended envelope；要注册 P2.2/P2.3 process metadata，需要在 `local-manager-api` 增加 Manager-only registration route，并在 `cli-adapter-real` wrapper/notch-run 中调用。
- 2026-06-08 设计决策：新增 `POST /v1/process/registrations` 作为 Local Manager API 内部 endpoint，不修改 shared protocol envelope。endpoint 要求 session 已存在且 `sourceMode` 为 `live` 或 `wrapper`；它只写 Manager registry/persistence，不触发真实 retry/terminate。`wrapper` sourceMode 可登记但后续真实 process action 仍会被 P2.2 runtime 的 live-session 校验约束。
- 2026-06-08 实现阶段：`local-manager-mock` 的 `ProcessPersistenceSnapshot` 新增 `processOwnership` 并在 `registerProcessOwnership()` 时持久化；`local-manager-api` 新增 `/v1/process/registrations`，写入 retry launch profile 和 process ownership；`cli-adapter-real` 新增 process registration payload/hash 生成与 `postProcessRegistration()`，wrapper/notch-run 在 child spawn 后登记。Desktop 未改动。
- 2026-06-08 测试阶段：已新增 API registration 测试、JSON store ownership hydrate 测试、mock manager ownership persistence 测试、real adapter payload/post/wrapper registration 测试。当前通过：`npm run test -w @notch-ai-monitor/local-manager-mock` 22/22，`npm run test -w @notch-ai-monitor/local-manager-api` 10/10，`npm run test -w @notch-ai-monitor/cli-adapter-real` 20/20。
- 2026-06-08 验证结束：`npm run build:app -w @notch-ai-monitor/desktop` 通过；`npm run test:qa` 10/10 通过；`git diff --check` 通过；Local Manager API 实际请求验证 `/health` ok、`/v1/process/registrations` 返回 `notch.process.registered`；in-app Browser API mode 验证 `1 个会话`、`0` active event、console error 0。验证后已调用 `/v1/debug/reset` 清空 API snapshot。
- 2026-06-08 收尾结束：P2.4 real CLI adapter registration 完成。当前服务已用最新 dist 重启：Local Manager API `http://127.0.0.1:4317`，Desktop Vite `http://127.0.0.1:5174`。已准备写入 handoff：`docs/handoffs/main-agent-real-cli-adapter-registration-p2.md`。

## 10. P2.4b Real Supervisor 工作日志

- 2026-06-08 开始：进入 P2.4b，目标是给 Local Manager API 接入 real retry supervisor / graceful terminate supervisor。边界：默认 side effect mode 仍保持 mock；真实 supervisor 必须显式启用；Desktop 不直接启动或终止进程；terminate 只能对 supervisor 自己持有 child handle 的进程做 graceful stop，不能只凭 PID 直接 kill。
- 2026-06-08 复核：P2.4 已让 real adapter 登记 launch profile 和 process ownership；P2.2b 的 Manager supervised retry/terminate 分支已经存在并有 fake supervisor tests。当前缺口在 `local-manager-api` 没有真实 `ProcessSupervisor` 实现，也没有启动参数开启 `processSideEffectMode: "supervised"`。P2.4b 可在 API 层新增 opt-in supervisor，不需要修改 shared protocol 或 Desktop。
- 2026-06-08 实现阶段：`RetryLaunchProfileInput` 新增可选 `executable`，registration endpoint 和 real adapter payload 同步登记该字段；`local-manager-api` 新增 `LocalProcessSupervisor`，supervised retry 使用 `spawn(executable, args, { shell: false })` 启动新 child session，并回写新 session 的 launch profile/process ownership；graceful terminate 只对当前 supervisor 自己启动并持有 handle 的 child 发起 stop request，找不到 handle 时返回 `graceful_process_not_owned_by_supervisor`，不按 PID 操作外部进程。
- 2026-06-08 测试阶段：新增 API supervised retry/terminate 测试，覆盖真实 child retry 启动、supervisor-owned child graceful stop、外部 registered PID 无 handle 时不能 terminate。当前通过：`npm run test -w @notch-ai-monitor/local-manager-mock` 22/22，`npm run test -w @notch-ai-monitor/local-manager-api` 13/13，`npm run test -w @notch-ai-monitor/cli-adapter-real` 20/20。
- 2026-06-08 验证结束：`npm run build:app -w @notch-ai-monitor/desktop` 通过；`npm run test:qa` 10/10 通过；`git diff --check` 通过；实际 API supervised smoke 通过，结果为 retry `completed` / `mocked=false`、terminate `accepted` / `mocked=false`、child session 最终 `signal:SIGTERM` 结束；in-app Browser API mode 验证 quiet 页面 `0 个会话`、`0` event、console error 0。
- 2026-06-08 收尾结束：P2.4b opt-in real supervisor 完成。当前服务已重启：Local Manager API `http://127.0.0.1:4317`，并以 `process side effects: supervised` 运行；Desktop Vite `http://127.0.0.1:5174`。下一步可进入 P2.5 产品化 Session Hub，或继续 P2.4c 做 adapter 控制通道/异步 action completion。

## 11. P2.4c Adapter Control Channel 工作日志

- 2026-06-08 开始：进入 P2.4c，目标是让 wrapper/notch-run 外部 child 也能通过安全 adapter 控制通道走 graceful stop，而不是让 Local Manager API 按 PID 操作。设计边界：wrapper 在本机 `127.0.0.1` 开临时 control endpoint；registration 传递 endpoint 和 bearer token；Manager 只对匹配 session/run/launch profile 的 endpoint 发 graceful terminate request；Desktop 仍不接触控制通道。
- 2026-06-08 复核：P2.4b 的 `LocalProcessSupervisor` 只能 terminate 自己通过 retry 启动并持有 handle 的 child。wrapper/notch-run 已经在 adapter 进程内持有 child handle，因此 P2.4c 最小实现应把 graceful stop 下沉到 adapter 自己执行，Manager 只做能力校验和本地 control request，不引入 PID 终止或 shared protocol 扩展。
- 2026-06-08 实现阶段：`cli-adapter-real` wrapper/notch-run 新增本机 control server，绑定 `http://127.0.0.1:<random>/v1/control/terminate-gracefully`，使用一次性 bearer token、sessionId、runId、launchProfileHash 校验目标后对自己持有的 child handle 发 graceful stop request；registration payload 新增 `controlEndpoint` / `controlToken`，但 wrapper summary 不打印 raw token。`local-manager-api` registration endpoint 只接受 `http://127.0.0.1` control endpoint，并把 raw token 只放入 `LocalProcessSupervisor` 内存 control registry，不进入 persistence。
- 2026-06-08 测试阶段：新增 API control-channel 测试和 wrapper control-channel 测试，覆盖 Manager 通过 bearer token 调 adapter endpoint、adapter 验证目标并让 child 退出。当前通过：`npm run test -w @notch-ai-monitor/local-manager-mock` 22/22，`npm run test -w @notch-ai-monitor/local-manager-api` 14/14，`npm run test -w @notch-ai-monitor/cli-adapter-real` 21/21。
- 2026-06-08 验证结束：`npm run build:app -w @notch-ai-monitor/desktop` 通过；`npm run test:qa` 10/10 通过；`git diff --check` 通过；实际 P2.4c smoke 通过，action result 为 terminate `accepted` / `mocked=false`，target `#adapter-graceful-stop-requested`，wrapper control enabled。验证后已 reset API snapshot；in-app Browser API mode 验证 quiet 页面 `0 个会话`、`0` event、console error 0。
- 2026-06-08 收尾结束：P2.4c adapter control channel 完成。当前服务已重启：Local Manager API `http://127.0.0.1:4317`，以 `process side effects: supervised` 运行；Desktop Vite `http://127.0.0.1:5174`。下一步最稳可进入 P2.5 产品化 Session Hub，或 P2.4d 做 async action completion/event auto-resolution。

## 12. P2.4d Async Action Completion 工作日志

- 2026-06-08 开始：进入 P2.4d，目标是补齐 `accepted` process action 的异步闭环：adapter/supervisor 后续成功时自动 resolve 原 active event；adapter control request 异步失败时写入失败 audit 并保持 event active。边界：不改 shared protocol，不给 Desktop 新权限，不引入 PID terminate；只新增 Manager/API 内部 completion 入口和 supervisor callback。
- 2026-06-08 复核：P2.4c 的 wrapper control channel 已经做到 Manager 只通过 `127.0.0.1` bearer control endpoint 请求 adapter 自己 graceful stop，未按 PID 操作；当前缺口是 `accepted` 返回后没有 completion 回写，且 control HTTP 异步失败会被吞掉。P2.4d 可通过 `local-manager-mock` 内部 completion 方法、`LocalProcessSupervisor` pending action registry 和 `local-manager-api` session-ended 桥接完成，不需要修改 shared model/protocol、EventQueue/StateMachine、Desktop 或 retry/terminate 外部 action payload。
- 2026-06-08 实现开始：计划新增 `completeAcceptedProcessAction()`，成功 completion 替换 requestId replay result 并 resolve 原 active event，失败 completion 替换 replay result、追加 failed audit 但保持 event active。`LocalProcessSupervisor` 只记录自己已 accepted 的 pending terminate；local child close 或 adapter `notch.session.ended` 触发 completed，adapter control HTTP 4xx/5xx/网络错误触发 failed。
- 2026-06-08 实现阶段：`local-manager-mock` 新增 `ProcessActionCompletionInput` 和 `completeAcceptedProcessAction()`；completion 会查找同 session/action/requestId 的 accepted audit，成功时写 `completed` replay/audit 并 resolve event，失败时写 `failed` replay/audit 且 event 保持 active。`local-manager-api` 的 `LocalProcessSupervisor` 新增 pending terminate registry、`handleSessionEnded()` 和 adapter control response/error 检测；API 的 session-ended 处理统一桥接 session 状态、ownership inactive 与 pending action completion。
- 2026-06-08 测试阶段：新增 mock completion 单测，覆盖 accepted terminate 后 successful completion 自动 resolve、failed completion 保持 active 且同 requestId replay 返回 failed。新增 API 单测，覆盖 adapter control 202 + `notch.session.ended` 自动 resolve，以及 adapter control 500/`ok:false` 写 failed audit 且 event active。当前通过：`npm run test -w @notch-ai-monitor/local-manager-mock` 24/24，`npm run test -w @notch-ai-monitor/local-manager-api` 16/16。
- 2026-06-08 验证结束：`npm run test -w @notch-ai-monitor/cli-adapter-real` 21/21 通过；`npm run build:app -w @notch-ai-monitor/desktop` 通过；`npm run test:qa` 10/10 通过；`git diff --check` 通过；`rg` 检查未新增 `SIGKILL` / `kill -9` / 按 PID terminate，实现中仍只有既有 `child.kill("SIGTERM")` graceful stop。实际 API smoke 覆盖 adapter control accepted + `notch.session.ended` 自动 resolve，以及 adapter control 500 后 requestId replay failed/event active；in-app browser API mode 验证 quiet 页面“全部安静 / 0”、console error 0。
- 2026-06-08 收尾结束：已新增 `docs/handoffs/main-agent-async-action-completion-p2.md`。当前服务已重启：Local Manager API `http://127.0.0.1:4317`，以 `process side effects: supervised` 运行；Desktop Vite `http://127.0.0.1:5174`。P2.4d 完成，下一步最稳可进入 P2.5 产品化 Session Hub；如继续深挖 P2.4，应先设计 async action-result push 或 pending action visibility 的 shared/UI 合同。

## 13. 当前边界

- P2.4 已做最小边界扩展：Local Manager API 新增内部 registration endpoint，real CLI adapter 新增 wrapper/notch-run registration call。
- 后续仍不修改 shared model、shared protocol、EventQueue/StateMachine，除非先在计划中说明必要性。
- `view-log` 必须保持 read-only、可审计、不 resolve event。
- Desktop UI 只消费 Manager action result；不得直接打开本地路径、读取日志文件或控制 CLI 进程。
- `retry` / `terminate` 真实 side effects 必须先经过 P2.2 合同，不能直接 kill 进程。

## 14. P2.5 Productized Session Hub 工作日志

- 2026-06-08 开始：进入 P2.5 产品化 Session Hub。目标是在现有 Desktop UI 内把基础 sessions panel 升级为可扫描、可筛选、可进入事件处理的 Hub；不新增 Manager/API 权限，不让 Desktop 读取 process persistence 或调用 `/v1/process/registrations`，不接真实 view-log/retry/terminate side effect。
- 2026-06-08 复核：P2.4d 已完成 async action completion；其未解决的 pending action visibility 可作为未来 shared/UI 合同，不塞进 P2.5。Product Design saved context 为空，本阶段以仓库现有 `design/notch-ai-monitor-hifi.*`、当前 `apps/desktop/src/app/app-shell.ts` 和 `notch.css` 作为视觉源。现有 Desktop 已有 session capsule、sessions panel、session detail 与 action panel 切换，P2.5 应在这些本地组件上增强，不重写整体视觉系统。
- 2026-06-08 实现计划：最小产品切片为 session summary rail、Hub 筛选/排序 controls、session row richer lifecycle/status、选中 session 的 active event 列表和可点击“处理事件”入口。筛选/排序只作用于 Desktop 当前 snapshot；事件处理仍走现有 action panel 和 Manager action request。
- 2026-06-08 实现阶段：`UIStore` 新增 `sessionHubFilter` / `sessionHubSort`；Desktop sessions panel 新增 summary rail、筛选 segmented control、排序 segmented control、筛选空态和 session-detail 内 active event 列表。点击 session event 只会选择已有 event 并打开 action panel，不新增 action side effect 或 Manager endpoint。
- 2026-06-08 测试阶段：新增 mock QA 覆盖 Hub summary、filter、sort、session event entry；API client smoke 中补充 live failed session 的 Hub event entry 验证。当前通过：`npm run build:app -w @notch-ai-monitor/desktop`，`npm run test:qa` 11/11。
- 2026-06-08 验证结束：`git diff --check` 通过；CSS 色彩扫描确认仍保留 teal/green/blue/red/purple/amber 多状态语义，没有把 UI 推成单一色系。in-app browser API mode 使用主 API 注入 `all` 场景后验证 Hub：summary 为 `3 会话 / 3 活跃 / 4 待处理 / 0 失败 / 0 已结束`，默认筛选 `全部`、默认排序 `优先级`，session row 3 条，选中 session event 可打开 action panel，console error 0。
- 2026-06-08 收尾结束：已新增 `docs/handoffs/main-agent-session-hub-productization-p2.md`。当前服务仍在：Local Manager API `http://127.0.0.1:4317`，Desktop Vite `http://127.0.0.1:5174`；浏览器停在 Session Hub 打开状态，API snapshot 为 P2.5 browser smoke 注入的 `all` 场景。P2.5 最小产品化完成，后续可继续做完整 event history/pending action visibility，或进入 P3 packaging/real-world beta 验收。

## 15. Event History / Pending Action Visibility 合同工作日志

- 2026-06-08 开始：进入完整 event history / pending action visibility 合同设计。目标是把 P2.5 Session Hub 的 active-only 视图扩展成未来可显示历史事件、动作排队/执行/失败状态的产品合同；本轮先写合同文档，不实现 runtime，不修改 shared model/API/protocol/EventQueue/StateMachine/real CLI adapter。
- 2026-06-08 复核：当前 `ManagerSnapshot.events` 已包含非 active 事件，但缺少分页、过滤、持久化读取边界和历史 timeline 语义；P2.4d 的 async completion 已把 accepted action 结果写入 Manager replay/audit，但 pending action 还没有对 Desktop 可见的 projection。实现完整功能时需要 Manager-owned read-only projection 或最小 snapshot/API 扩展；Desktop 仍不得读取 process persistence、action audit 私有结构或直接控制进程。
- 2026-06-08 设计阶段：新增 `docs/contracts/event-history-pending-actions-p2.md`，定义 Active Queue、Event History、Pending Action 三个边界；推荐 `EventHistoryRecord`、`EventTimelineEntry`、`PendingActionRecord` projection；后续最小 API 为只读 `GET /v1/event-history` 和 `GET /v1/action-requests`，并可在 `ManagerSnapshot` 上增加可选 `pendingActions` / `historySummary`。
- 2026-06-08 合同接线：已在 `docs/contracts/local-manager-api.md` 记录 planned read-only endpoints 与 snapshot 可选 projection；已在 `docs/contracts/retry-terminate-p2.md` 记录 P2.4d accepted/completed/failed 到 pending action visibility 的映射。合同明确 CLI adapter 不发送 history/pending record，Desktop 不读私有 store。
- 2026-06-08 验证结束：`git diff --check` 通过；触碰文档行尾空白检查通过。本轮只修改 docs/contracts 与 docs/handoffs，没有修改 TypeScript runtime、Desktop UI 或 API handler，因此未运行 build/test/Browser QA。
- 2026-06-08 收尾结束：已新增 `docs/handoffs/main-agent-event-history-pending-actions-contract-p2.md`。完整 event history / pending action visibility 合同设计完成，下一步可进入 Manager projection store 与 fake tests 实现。

## 16. 下一步入口

当前最稳下一步是 Tauri MVP release hardening，而不是回到 Electron：

- `smoke:tauri-mvp` 自动化：覆盖 `.app` 启动、app-managed Manager health、Desktop connected、Session Hub/action panel、real-link event 和退出清理。
- Tauri artifact resource strategy：决定是否 bundle Node sidecar / Manager runtime，让 `.app` 从本地 MVP 走向可分发 artifact。
- Tauri DMG 或安装包：解决当前 create-dmg 未完成的问题。
- Tauri signing/notarization gate：Developer ID、notary credentials、codesign/spctl/stapler、signed artifact smoke。
- Applications 安装、覆盖安装、用户目录 persistence 迁移和升级 QA。
- 如要进入 formal host，先写 Tauri vs SwiftUI/AppKit ADR，再改 UI/packaging。
- `terminate` 真实实现只能做 graceful stop；force kill 必须另开合同与 action。
- Desktop 仍不得直接 kill 进程、attach PTY、启动 CLI、读取 persistence file 或读取 control token。

## 17. Event History / Pending Action Visibility 实现工作日志

- 2026-06-08 开始：进入实现切片。顺序按用户要求执行：先 `local-manager-mock` event history / pending action projection store port 和 fake tests，再接 Local Manager API read-only endpoints，最后接 Desktop History/Pending UI。
- 2026-06-08 复核计划：P2.4d 已有 action replay/completion 和 process audit，P2.5 已有 Session Hub active event 入口；本轮实现会保持 Desktop 只消费 Manager projection，不读取 process persistence/audit/control registry。为让 API 与 Desktop 共享 projection shape，计划对 shared 只做最小可选类型扩展，不改变 protocol envelope、EventQueue/StateMachine、real CLI adapter 或 process side effect 能力。
- 2026-06-08 Manager projection 阶段结束：`shared` 新增 optional `ManagerSnapshot.pendingActions` / `historySummary` 以及 event history/pending action projection 类型；`local-manager-mock` 新增 `EventHistoryPersistenceStore` port、`getEventHistory()`、`getPendingActions()`、history/timeline/pending projection 写入点。`npm run test -w @notch-ai-monitor/local-manager-mock` 27/27 通过。
- 2026-06-08 API 阶段开始：进入 Local Manager API read-only endpoint 实现。目标是新增 `GET /v1/event-history` 与 `GET /v1/action-requests`，只返回 Manager projection 与 snapshot，不触发 side effect，不读取 process audit/control registry 原始私有结构。
- 2026-06-08 API 阶段结束：Local Manager API 新增 `GET /v1/event-history` / `GET /v1/action-requests`，支持 session/status/type/eventId/cursor/limit query 校验与分页；API tests 新增只读 projection 与非法 query 覆盖。`npm run test -w @notch-ai-monitor/local-manager-api` 18/18 通过。
- 2026-06-08 Desktop 阶段开始：进入 Session Hub History/Pending UI。计划扩展 `DesktopManagerClient` 只读 projection 方法，API mode 调 endpoints，mock mode 从 snapshot projection 兜底；UI 只展示 pending/history，不给 history item 新增 retry/terminate shortcut。
- 2026-06-08 Desktop 阶段结束：Desktop manager client 新增 `getEventHistory()` / `getActionRequests()`；mock mode 直接读 Manager projection，API mode 调 read-only endpoints。Session Hub selected session detail 新增“动作状态”和“事件历史”只读区块；history item 不新增 action shortcut。`npm run build:app -w @notch-ai-monitor/desktop` 通过；`npm run test:qa` 11/11 通过。
- 2026-06-08 验证结束：`npm run build` 通过；`git diff --check` 通过。手动 API probe 验证 `/v1/event-history` 返回 ok，注入 `all` 后 `historySummary.totalEvents=4`。in-app browser API mode 验证 Session Hub 显示“动作状态/事件历史”，reject risk 后 pending 显示“已完成/拒绝执行”、history 显示“已忽略”，console error 0。
- 2026-06-08 收尾结束：已新增 `docs/handoffs/main-agent-event-history-pending-actions-implementation-p2.md`。当前 Local Manager API 已用最新 dist 在 `http://127.0.0.1:4317` 重启，Desktop Vite 仍在 `http://127.0.0.1:5174`；浏览器停在 API mode Session Hub。最终已重新注入 `all` 场景，当前 API snapshot 为 4 个 active events、historySummary.totalEvents=4、pendingActions=0。

## 18. Event History JSON Persistence 工作日志

- 2026-06-08 开始：进入下一步，实现 Local Manager API event history JSON persistence store。目标是让 P2 event history / pending action projection 可选落盘，并保持与 P2.3 process persistence 的 logical section 分离；Desktop 仍不读取文件，只消费 Manager/API projection。
- 2026-06-08 复核计划：现有 `JsonFileProcessPersistenceStore` 只保存 process state，`local-manager-mock` 已有 `EventHistoryPersistenceStore` port；本轮将在 `local-manager-api` 新增独立 JSON store、`eventHistoryPersistenceFile` option、`NOTCH_EVENT_HISTORY_PERSISTENCE_FILE` env 和 `--event-history-persistence-file` CLI arg，不修改 Desktop UI 或 real CLI adapter。
- 2026-06-08 实现阶段：`local-manager-api` 新增 `JsonFileEventHistoryPersistenceStore`，文件 schema 为 `{ schemaVersion: 1, eventHistory }`，并支持读取旧式 bare snapshot；`createLocalManagerApi()` 新增 `eventHistoryPersistenceFile` option，server bin 新增 env/CLI 参数。该 store 只注入 Manager 的 `EventHistoryPersistenceStore` port，不触发 action side effect。
- 2026-06-08 测试阶段：新增 API 单测覆盖 JSON store 保存/读取 event history records、timeline、pending actions、cursorVersion，以及 `createLocalManagerApi({ eventHistoryPersistenceFile })` hydrate 后 read-only endpoint 可读。`npm run test -w @notch-ai-monitor/local-manager-api` 20/20 通过。
- 2026-06-08 合同阶段：`docs/contracts/local-manager-api.md` 已记录 `NOTCH_EVENT_HISTORY_PERSISTENCE_FILE` 与 `--event-history-persistence-file`；`docs/contracts/event-history-pending-actions-p2.md` 已把 Local Manager API JSON persistence 从后续建议改为已完成，并明确 process/history 是不同 logical sections，Desktop 不读文件原文。
- 2026-06-08 验证结束：`npm run build` 通过；`npm run test:qa` 11/11 通过；`git diff --check` 通过。运行态 smoke 使用 `/tmp/notch-event-history-p2.json` 启动 API，注入 `all` 后文件写出 `schemaVersion=1`、`events=4`、`timeline=4`、`pendingActions=0`、`cursorVersion=4`；重启同一文件后 `/v1/event-history?limit=10` hydrate 返回 `history=4`、`totalEvents=4`。
- 2026-06-08 Browser 验证结束：in-app browser API mode 打开 Session Hub 后可见“动作状态”和“事件历史”，console error 0。当前 Local Manager API `http://127.0.0.1:4317` 已用最新 dist 运行，PID `79079`，启动参数包含 `--process-side-effects supervised --event-history-persistence-file /tmp/notch-event-history-p2.json`；Desktop Vite `http://127.0.0.1:5174`，PID `94874`。
- 2026-06-08 收尾结束：已新增 `docs/handoffs/main-agent-event-history-json-persistence-p2.md`。下一步最稳是 Desktop History filters/pagination UI，或 pending action timeout/heartbeat 策略；继续保持 Desktop 不读 persistence file、不绕过 action request。

## 19. Desktop History Filters / Pagination 工作日志

- 2026-06-08 开始：选择先做 Desktop History filters/pagination UI，而不是 pending action timeout/heartbeat。原因是 filters/pagination 只消费已完成的 Manager/API read-only projection 和 event history JSON persistence，风险较低且可直接 Browser QA；timeout/heartbeat 会改变 action lifecycle，需要单独合同。
- 2026-06-08 复核计划：本轮只改 Desktop Session Hub 展示与 QA，不新增 action side effect，不让 Desktop 读取 persistence file、process audit、control endpoint 或 raw token。History filters 应通过 `DesktopManagerClient.getEventHistory()` 查询 API/mock projection；pagination 使用 endpoint cursor/limit，不从本地一次性加载无限历史。
- 2026-06-08 实现阶段：`UIStore` 新增 history status/type filter 与 cursor stack；Session Hub detail 的 History 区块新增 status/type segmented controls 与上一页/下一页 pager。`refreshHubProjections()` 改为按当前 selected session + filters + cursor + `limit=5` 调 `getEventHistory()`，pending actions 仍保持只读 projection。History rows 继续只读，不新增 retry/terminate/view-log shortcut。
- 2026-06-08 QA 调整：mock QA 覆盖 history type/status filter；API QA 新增 6 条同 session history 的 cursor pagination smoke。新增 projection fetch 后发现测试 API close 容易被 keep-alive/SSE 连接拖住，已在 `LocalManagerApiServer.close()` 中显式 `closeIdleConnections()` / `closeAllConnections()`，API 单测确认 SSE 不受影响。
- 2026-06-08 验证阶段：`npm run test -w @notch-ai-monitor/local-manager-api` 20/20 通过；`npm run build:app -w @notch-ai-monitor/desktop` 通过；`npm run test:qa` 12/12 通过；`npm run build` 通过。
- 2026-06-08 Browser 验证结束：Local Manager API 已用最新 dist 重启并注入 `all` 场景；in-app browser API mode 打开 Session Hub 后可见 History status/type filters 和 pager。点击 type=`risk` 后 History rows 从 2 条变为 1 条，行文本为“风险 已拦截危险命令 待处理 · 6/6 11:42”；console error 0。

## 20. Pending Action Timeout / Heartbeat 工作日志

- 2026-06-08 开始：进入 pending action timeout/heartbeat 策略合同和最小 runtime tests。边界：只影响 Manager-owned pending action projection 与同 requestId replay，不新增 Desktop 控制能力，不新增 API side-effect endpoint，不让 Desktop 读取 process audit/persistence/control token。
- 2026-06-08 复核计划：现有 `PendingActionRecord` 已有 `expiresAt` 和 `expired` visibility status；`accepted` process action 当前投影为 `in_progress`，P2.4d completion 可把同 requestId 更新为 completed/failed。最小实现选择 Manager 显式 sweep：`in_progress` 超时后 visibility 变 `expired`、replay result 变 `failed`、event 保持 active；heartbeat 只延长 deadline，不自动 resolve event。
- 2026-06-08 实现阶段：`local-manager-mock` 新增 `pendingActionTimeoutMs` option、默认 `DEFAULT_PENDING_ACTION_TIMEOUT_MS=5min`、`heartbeatPendingAction()` 与 `expirePendingActions()`。`accepted` / `in_progress` pending action 会写入 `expiresAt`；heartbeat 只更新 `updatedAt/expiresAt/message`；timeout sweep 写入 expired pending projection、failed replay result、`pending_action_timeout` timeline，并在有 accepted process audit 时追加 failed audit。
- 2026-06-08 测试阶段：新增 mock tests 覆盖 accepted terminate timeout 后 pending=`expired`、replay=`failed`、event 保持 active、late completion 不 resolve，以及 heartbeat 延长 deadline 后原 deadline sweep 不误过期。`npm run test -w @notch-ai-monitor/local-manager-mock` 29/29 通过。
- 2026-06-08 合同阶段：`docs/contracts/event-history-pending-actions-p2.md`、`docs/contracts/local-manager-api.md`、`docs/contracts/retry-terminate-p2.md` 已记录 timeout/heartbeat 策略；明确 expired 是只读 visibility，不增加 Desktop 进程控制权限。
- 2026-06-08 验证阶段：`npm run test -w @notch-ai-monitor/local-manager-api` 20/20 通过；`npm run build` 通过；`npm run test:qa` 12/12 通过。当前 runtime 未新增 API side-effect endpoint，timeout sweep 仍是 Manager 内部显式方法。
- 2026-06-08 Browser 验证结束：Local Manager API 已用最新 dist 重启并注入 `all` 场景；in-app browser API mode 打开 Session Hub 后可见“动作状态”“事件历史”和 history filters，historyRows=2、pendingRows=0、console error 0。当前服务：Local Manager API PID `96954`，Desktop Vite PID `94874`。
- 2026-06-08 收尾结束：已新增 `docs/handoffs/main-agent-pending-action-timeout-heartbeat-p2.md`。下一步最稳是决定 Local Manager API 是否加 internal scheduler 或 debug-only timeout sweep endpoint；仍不得让 Desktop 直接操作 process 或 persistence。

## 21. Debug Pending Action Timeout Sweep 工作日志

- 2026-06-08 开始：进入 Local Manager API debug-only timeout sweep 切片。目标是给已完成的 Manager `expirePendingActions()` 显式 sweep 增加可 API/QA 验证的本地调试入口，暂不引入 internal scheduler，也不新增 Desktop 控制能力。
- 2026-06-08 复核计划：P2.20 已把 timeout/heartbeat runtime 放在 `local-manager-mock` Manager 内部；当前缺口是 API mode 下无法触发 sweep 做可审计验证。本轮计划新增 `POST /v1/debug/expire-pending-actions`，只允许可选 `at` 时间参数，返回 expired pending actions 与 snapshot；不修改 shared protocol、EventQueue/StateMachine、real CLI adapter 或 Desktop UI。
- 2026-06-08 实现阶段：Local Manager API 新增 debug-only `POST /v1/debug/expire-pending-actions`，支持空 body 或 `{ "at": ISODateTimeString }`，调用 Manager `expirePendingActions()` 并返回 `expiredActions` 与最新 snapshot。该 endpoint 与 `/v1/debug/reset` 同级，不走 protocol envelope，不提供 retry/terminate 新能力。
- 2026-06-08 测试阶段：新增 API 单测覆盖 adapter-control accepted terminate 的 pending projection 过期、同 `requestId` replay 变 `failed/pending_action_timeout`、event 保持 active、`GET /v1/action-requests?status=expired` 可读，以及非法 `at` 返回 `400 invalid_payload`。`npm run test -w @notch-ai-monitor/local-manager-api` 21/21 通过。
- 2026-06-08 验证阶段：`npm run test -w @notch-ai-monitor/local-manager-mock` 29/29 通过；`npm run build` 通过；`npm run test:qa` 12/12 通过；`git diff --check` 与 touched-file 行尾空白检查通过。runtime direct API probe 验证 `expiredCount=1`、`visibleExpiredCount=1`、replay `failed/pending_action_timeout`、event 保持 `active`。
- 2026-06-08 Browser 验证结束：Local Manager API 已用最新 dist 重启，PID `23610`，参数包含 `--process-side-effects supervised --event-history-persistence-file /tmp/notch-event-history-p2.json`；Desktop Vite PID `94874`。in-app browser API mode Session Hub 显示“动作状态”1 条“已过期”，事件仍在“待处理事件”和“事件历史”中，console error 0。
- 2026-06-08 收尾结束：已新增 `docs/handoffs/main-agent-debug-pending-timeout-sweep-p2.md`。当前 API snapshot 保留 runtime probe 的 expired pending action，便于可视验收；后续如要回到 fixture，可调用 `/v1/debug/reset` 后重新注入 `all`。下一步可继续设计 internal scheduler/SSE update，或进入 P3 packaging/real-world beta 验收。

## 22. Internal Scheduler / SSE Update 设计工作日志

- 2026-06-08 开始：进入 internal scheduler / SSE update 合同设计。本轮只写设计，不实现后台 timer，不修改 runtime，不接真实 retry/terminate 新 side effect。目标是明确无人值守 timeout sweep、SSE 更新频率、持久化恢复和测试时钟边界。
- 2026-06-08 复核计划：当前 `local-manager-mock` 已有 `expirePendingActions()`，Local Manager API 已有 debug-only `POST /v1/debug/expire-pending-actions`，现有 SSE 只广播 `notch.snapshot.updated` 且 Manager snapshot 已包含 `pendingActions/historySummary`。设计主路径应优先复用 snapshot SSE；只有出现高频 history/pending 增量需求时再引入 `notch.history.updated`。
- 2026-06-08 设计阶段：新增 `docs/contracts/internal-scheduler-sse-p2.md`。合同规定第一阶段 scheduler 是 Local Manager API opt-in timer，默认关闭；启用后只调用 `manager.expirePendingActions({ at: clock() })`，不调用 retry/terminate/supervisor，不读取 control token，不按 PID 操作。SSE 第一阶段继续使用 `notch.snapshot.updated`；`notch.history.updated` 仅作为未来 refresh hint，不作为事实源。
- 2026-06-08 合同接线：`docs/contracts/event-history-pending-actions-p2.md`、`docs/contracts/local-manager-api.md`、`docs/contracts/retry-terminate-p2.md` 已更新 scheduler/SSE 设计入口。Local Manager API 文档记录 planned `NOTCH_PENDING_ACTION_SWEEP_INTERVAL_MS` / `--pending-action-sweep-interval-ms`，但明确 runtime 尚未实现。
- 2026-06-08 验证结束：本轮为 doc-only design，未修改 TypeScript runtime，因此未运行 build/test/Browser QA。`git diff --check` 通过；touched-file 行尾空白检查通过。
- 2026-06-08 收尾结束：已新增 `docs/handoffs/main-agent-internal-scheduler-sse-design-p2.md`。下一步最稳是实现 opt-in Local Manager API scheduler：API option/timer lifecycle -> bin env/CLI args -> API tests covering scheduler/SSE/close cleanup/persistence recovery -> build/QA -> Browser API mode auto-expire smoke。

## 23. Internal Scheduler Runtime 工作日志

- 2026-06-08 开始：进入 opt-in Local Manager API internal scheduler runtime 实现。边界沿用设计合同：默认关闭；仅由 `pendingActionSweepIntervalMs` / `NOTCH_PENDING_ACTION_SWEEP_INTERVAL_MS` / `--pending-action-sweep-interval-ms` 显式开启；tick 只调用 `manager.expirePendingActions({ at: clock() })`。
- 2026-06-08 复核计划：仓库根目录当前没有实体 `AGENTS.md`，继续遵守用户消息中的 AGENTS 规则。现有 API 已有 debug sweep endpoint、Manager snapshot SSE、`LocalManagerApiServer.close()` 的 SSE/HTTP cleanup；scheduler 可只接在 API server listen/close 生命周期，不需要修改 shared protocol、Desktop UI、EventQueue/StateMachine 或 real CLI adapter。
- 2026-06-08 实现阶段：`LocalManagerApiOptions` 新增 `pendingActionSweepIntervalMs?: number | null`；`LocalManagerApiServer.listen()` 成功后执行 startup sweep 并启动 interval；`close()` 最前面清理 timer；server bin 新增 `NOTCH_PENDING_ACTION_SWEEP_INTERVAL_MS` 和 `--pending-action-sweep-interval-ms` 解析。scheduler tick 只调用 `manager.expirePendingActions({ at: clock() })`。
- 2026-06-08 测试阶段：新增 API tests 覆盖默认关闭不自动过期、opt-in interval 自动过期、no-op tick 不广播 snapshot、SSE 收到 `notch.snapshot.updated` 且 pending=`expired`、event history persistence hydrate 后 startup sweep 过期 stale pending、close cleanup 停止后续 tick、scheduler 不调用 `ProcessSupervisor`。`npm run test -w @notch-ai-monitor/local-manager-api` 28/28 通过。
- 2026-06-08 合同阶段：`docs/contracts/local-manager-api.md`、`docs/contracts/internal-scheduler-sse-p2.md`、`docs/contracts/event-history-pending-actions-p2.md`、`docs/contracts/retry-terminate-p2.md` 已从 planned/design wording 更新为 scheduler runtime 已实现；仍明确默认关闭、0/unset 关闭、显式 interval 开启、SSE 第一阶段复用 `notch.snapshot.updated`。
- 2026-06-08 验证阶段：`npm run test -w @notch-ai-monitor/local-manager-mock` 29/29 通过；`npm run build` 通过；`npm run test:qa` 首轮有 1 条 Session Hub pagination click flake，单条重跑通过，随后完整 `npm run test:qa` 12/12 通过；`git diff --check` 通过；安全边界扫描未发现 scheduler 新增 `process.kill` / PID kill / retry / terminate / supervisor 调用。
- 2026-06-08 Browser QA：使用 in-app Browser 连接临时 API `http://127.0.0.1:4318` 与 Desktop `http://127.0.0.1:5174`，通过 UI 二次点击 `terminate` 创建 accepted pending action。Session Hub 先显示“正在处理”，scheduler 自动 sweep 后通过 snapshot SSE 更新为“已过期”，console error 0。临时 4318 API 已停止，未遗留监听。

## 24. Pending Confirmation Projection Supersede 工作日志

- 2026-06-08 开始：进入 pending confirmation projection 收口。目标是修正 UI 里同一 event/action 先出现 `waiting_confirmation`，确认后又出现 `in_progress/expired`，导致“等待确认 + 正在处理/已过期”并存的问题。边界：改 Manager-owned pending projection，不新增 Desktop 控制能力，不修改 shared protocol，不接真实 retry/terminate 新 side effect。
- 2026-06-08 复核计划：`recordPendingActionResult()` 当前按 `requestId` upsert，因此第一次 `needs_confirmation` 和第二次 confirmed `accepted` 会成为两条 pending projection。修正点应在 Manager pending projection 写入逻辑，而不是让 Desktop 过滤私有语义。
- 2026-06-08 实现阶段：`local-manager-mock` 在写入非 `waiting_confirmation` action result 前，会移除同一 `eventId + actionId` 的旧 `waiting_confirmation` pending projection；timeline/audit/replay 仍保留各自事实记录，只收口用户可见 pending projection。
- 2026-06-08 测试阶段：新增 mock manager 测试覆盖 terminate 先 `needs_confirmation` 再 confirmed `accepted` 后只保留一条 `in_progress`；新增 API 测试覆盖 `/v1/action-requests` 只返回 confirmed request。`npm run test -w @notch-ai-monitor/local-manager-mock` 30/30 通过；`npm run test -w @notch-ai-monitor/local-manager-api` 29/29 通过。
- 2026-06-08 合同阶段：`docs/contracts/event-history-pending-actions-p2.md`、`docs/contracts/local-manager-api.md`、`docs/contracts/retry-terminate-p2.md` 已记录 confirmation supersede 规则：后续非 waiting projection supersede 同 event/action 的旧 waiting confirmation；audit/timeline 可保留事实。
- 2026-06-08 验证阶段：`npm run build` 通过；`npm run test:qa` 首轮仍在既有 Session Hub history pagination 测试抖动，单条重跑通过，随后完整 `npm run test:qa` 12/12 通过。in-app Browser 使用临时 API `http://127.0.0.1:4318` 走 UI terminate 二次确认，动作状态区块只显示 1 条“正在处理”，不再显示“等待确认”，console error 0；临时 API 已停止。

## 25. Real Link Beta Smoke 工作日志

- 2026-06-08 开始：进入真实链路 beta smoke。目标是重启长期 Local Manager API `127.0.0.1:4317` 到最新 build，并用 real CLI adapter / `notch-run` 验证 registration -> action -> pending projection -> completion/timeout 闭环。边界：只操作本地开发服务；Desktop 继续只读 Manager API；不新增代码功能，不直接按 PID 实现产品 terminate。
- 2026-06-08 复核阶段开始：开始核对当前长期服务、real CLI adapter smoke 脚本、`notch-run` 参数和 action request/registration 真实链路。当前发现 4317 由 node PID `23610` 监听，5174 由 node PID `94874` 监听；后续将用 SIGTERM 重启 4317 到最新 build。
- 2026-06-08 复核阶段结束：确认 `notch-run` 会以 wrapper/live 模式启动子进程、注册 adapter control endpoint/token hash、捕获 stdout/stderr 生成 active event，并在子进程退出后发送 `notch.session.ended`；真实 completion smoke 将使用长运行子进程，在 control server 存活期间发送 confirmed `terminate`，再等待 session ended 将 accepted pending projection 完成。
- 2026-06-08 服务重启阶段开始：准备重启长期 Local Manager API `127.0.0.1:4317` 到最新 build。计划保留既有 supervised side effect 与 `/tmp/notch-event-history-p2.json` event history persistence，并新增显式 `--pending-action-sweep-interval-ms 30000`；停止旧服务只使用 SIGTERM。
- 2026-06-08 服务重启阶段结束：`npm run build` 通过；旧 4317 PID `23610` 已用 SIGTERM 停止；长期 API 已用最新 dist 重启在 `http://127.0.0.1:4317`，新 PID `91452`，参数为 `--process-side-effects supervised --event-history-persistence-file /tmp/notch-event-history-p2.json --pending-action-sweep-interval-ms 30000`。`/health` 返回 ok。
- 2026-06-08 真实链路执行阶段开始：开始运行 real CLI adapter / `notch-run` smoke。第一步使用内置 `smoke:failed` 验证 live wrapper registration 与 active error event；第二步使用长运行子进程验证 confirmed `terminate` -> pending projection -> session ended completion。
- 2026-06-08 真实 completion smoke：`npm run smoke:failed` 通过，确认 `processRegistration.status=registered`、adapter control enabled、live session exitCode=7、active error event。随后长运行 `notch-run` 子进程走 `terminate` 未确认 -> confirmed：confirmed result 为 `accepted`、`mocked:false`、pending projection 单条 `in_progress`；子进程收到 graceful SIGTERM 后 exit 0，`notch.session.ended` 将原 event resolve 为 `terminate_graceful_completed`，`/v1/action-requests` 返回单条 `completed` pending action。
- 2026-06-08 真实 timeout smoke 准备：API 目前只公开 sweep interval，不公开短 pending timeout 启动参数；长期 4317 的默认 pending timeout 为 5 分钟。因此 timeout smoke 将使用真实 adapter/control 生成 accepted pending，再通过 debug-only `/v1/debug/expire-pending-actions` 传未来 `at` 推进 timeout projection；这不会新增产品 runtime side effect。
- 2026-06-08 真实 timeout smoke：第一次 8 秒延迟子进程因人工窗口错过而自然 completed，未计入 timeout 结论。第二次改为 30 秒延迟并用脚本连续执行 confirmed terminate + debug sweep：真实 adapter control 返回 `accepted`、pending 先为 `in_progress/mocked:false`，随后 debug sweep 返回 `expiredCount=1`，pending 变为 `expired/resultStatus=failed`，原 event 保持 `active`；late `notch.session.ended` 未把 expired pending 反改为 completed。
- 2026-06-08 Browser 验证阶段开始：使用当前 timeout smoke 终态验证 Desktop API mode 只读 projection。预期 Session Hub 可见 live session、active error event，以及动作状态单条“已过期”；Desktop 不直接读取 persistence file 或操作 CLI 子进程。
- 2026-06-08 Browser 验证阶段结束：in-app Browser 打开 `http://127.0.0.1:5174/?manager=api&managerUrl=http%3A%2F%2F127.0.0.1%3A4317` 并展开 Session Hub。UI 显示 `1 个会话 · 0 活跃 · 1 已结束 · 1 事件`，详情中“动作状态1 已过期 终止旧服务 动作等待完成超时，尚未收到可信完成信号”，事件历史保留 active error event；console error 0。
- 2026-06-08 收尾结束：已新增 `docs/handoffs/main-agent-real-link-beta-smoke-p2.md`。当前长期 Local Manager API 仍在 `http://127.0.0.1:4317`，PID `91452`，scheduler enabled `30000ms`；Desktop Vite 仍在 `http://127.0.0.1:5174`，PID `94874`；Browser 停在 API mode Session Hub 展开状态。当前 API 保留 timeout smoke 终态：1 个 completed live session、1 个 active error event、1 条 `expired/resultStatus=failed/mocked=false` pending action。

## 26. Repeatable Real Link QA Smoke 工作日志

- 2026-06-09 开始：进入真实链路 beta smoke 可重复化。目标是把上一轮手工 registration -> action -> pending projection -> completion/timeout 验收封装成 repo 内 QA 脚本，并决定/实现 dev/test-only `pendingActionTimeoutMs` opt-in 配置，让 timeout smoke 可通过短 timeout + scheduler 自然过期，而不是依赖人工 debug sweep 推进时间。
- 2026-06-09 复核阶段结束：`local-manager-mock` 已有 `pendingActionTimeoutMs` option 和默认 5min timeout，Local Manager API 目前只公开 `pendingActionSweepIntervalMs`，因此真实 timeout smoke 无法在短时间内靠 scheduler 自然过期。本轮决定增加显式 dev/test opt-in `NOTCH_PENDING_ACTION_TIMEOUT_MS` / `--pending-action-timeout-ms`，默认仍走 5min，不影响生产默认行为；QA 脚本将放在 real CLI adapter smoke 层，复用 `notch-run` wrapper/adapter control。
- 2026-06-09 实现阶段结束：`LocalManagerApiOptions` 新增 `pendingActionTimeoutMs?: number | null` 并传给 Manager；server bin 新增 `NOTCH_PENDING_ACTION_TIMEOUT_MS` / `--pending-action-timeout-ms`；root 新增 `scripts/real-link-beta-smoke.mjs` 和 `npm run smoke:real-link`。脚本默认启动临时 API（端口 0）、启用 supervised side effects、短 timeout + 短 scheduler，分别验证 completion 和 scheduler-driven timeout projection。
- 2026-06-09 合同阶段结束：`docs/contracts/local-manager-api.md`、`docs/contracts/internal-scheduler-sse-p2.md`、`docs/contracts/event-history-pending-actions-p2.md`、`docs/contracts/retry-terminate-p2.md` 已记录 dev/test timeout override、默认 5min 行为、`0` 关闭 deadline、以及 `npm run smoke:real-link` 的 repeatable QA 用法；再次明确该配置只改变 pending deadline，不新增 Desktop 或 process side effect 能力。
- 2026-06-09 验证阶段结束：`npm run test -w @notch-ai-monitor/local-manager-api` 30/30 通过；`npm run smoke:real-link` 通过，临时 API `127.0.0.1:64414` 上 completion 得到 `completed/resolved/terminate_graceful_completed`，timeout 得到 `expired/failed/pending_action_timeout` 且 event 保持 active；`npm run build` 通过；`npm run test:qa` 12/12 通过；`git diff --check` 通过。
- 2026-06-09 长期服务收口：由于本轮已改 API bin，长期 4317 旧 PID `91452` 已用 SIGTERM 停止，并以最新 dist 重启。当前 Local Manager API `http://127.0.0.1:4317` PID `31141`，参数包含 `--process-side-effects supervised --event-history-persistence-file /tmp/notch-event-history-p2.json --pending-action-sweep-interval-ms 30000`，日志显示 `pending action timeout: default`；重启后发现旧 event history persistence hydrate 出 orphan expired pending，已用 `/v1/debug/reset` 清成干净 snapshot。Desktop Vite 仍在 `http://127.0.0.1:5174`，PID `94874`。
- 2026-06-09 收尾结束：已新增 `docs/handoffs/main-agent-repeatable-real-link-smoke-p2.md`。当前建议下一步是把 `smoke:real-link` 接入 P2/P3 beta acceptance checklist，或补一条 Browser QA 脚本专门验证 real-link timeout 后 Desktop Session Hub 展示。

## 27-34. Superseded Electron Spike History (Compacted)

- P3 Product Shape Re-evaluation 标记保留：当时已按 `docs/technical-options-and-task-plan.md`、PRD、效果说明、产品审计、高保真稿和视觉基准截图复核产品形态；结论是正式产品不是普通 app window、dashboard、固定 popover 或 Web overlay。
- 2026-06-09 曾短暂探索 Electron app-managed Manager、`.app/.dmg` artifact、signing/notarization tooling、menu bar popover、透明 overlay 和 `electron-spike` safety gate。
- 这些探索已被用户纠偏和后续 Tauri MVP 决策取代：Electron active code、scripts、dependencies、generated artifacts 和 standalone handoff docs 均已清理。
- 保留的结论只有：Electron 不符合当前产品宿主路线，不应恢复为产品宿主、packaging spike 或默认 `.app` 路线；可复用的能力是 Manager API、Desktop read-only API mode、real CLI adapter、event history/pending action lifecycle 与 app-managed lifecycle 思路。
- P2/P3 beta acceptance 的当前事实以 `docs/qa/p2-p3-beta-acceptance.md` 为准；过期的 Electron standalone handoff 已在文档整理中删除。

## 35. Tauri MVP Host 工作日志

- 2026-06-09 开始：用户决定使用 Tauri 先实现 MVP。按 Product Design get-context playback，本轮 brief 为：产品是 macOS 刘海区域附近的本地 AI CLI agent 控制面；视觉源为 PRD、效果说明、高保真稿和视觉基准截图；交互目标是看到表情胶囊和左右胶囊/面板，但不能再用整屏透明 overlay 遮挡其他 app。技术路线上先实现 Tauri app-managed Manager 宿主和小尺寸顶部 WebView 胶囊窗口；保留 Local Manager API / Desktop read-only API / real adapter 成果，不修改 shared protocol、EventQueue/StateMachine 或真实 side effect。
- 2026-06-09 实现阶段中段：已新增 `apps/tauri` Tauri 2 MVP host，窗口为顶部居中的小尺寸透明 WebView，加载内置 `apps/desktop/dist/index.html?manager=api&surface=tauri-mvp`；Tauri 负责启动 app-managed Local Manager API、使用用户目录 process/event-history persistence、记录 `~/Library/Application Support/Notch AI Monitor/logs/tauri-mvp.log`，Desktop 仍只通过 Manager snapshot/read-only endpoints 渲染状态。下一步补退出信号清理、QA 文档和 build/smoke 验证。
- 2026-06-09 收尾结束：Tauri MVP `.app` 已完成并通过验证。`npm run guard:design`、`npm run build:app -w @notch-ai-monitor/desktop`、`npm run check -w @notch-ai-monitor/tauri-app`、`npm run build`、`npm run build:tauri-mvp` 均通过；Tauri `.app` 产物位于 `apps/tauri/src-tauri/target/release/bundle/macos/Notch AI Monitor Tauri MVP.app`。本地 `.app` 可直接启动，使用构建时注入的 repo path 找 Manager runtime；启动后 app-managed Manager URL `http://127.0.0.1:60840`，PID `66773`，Tauri app PID `66768`。已注入 debug `all` 场景，截图 `output/tauri-mvp/tauri-mvp-app-final-running.png` 可见左会话胶囊和右风险/表情胶囊；窗口是顶部局部 surface，不是整屏 overlay。SIGTERM 退出清理验证通过，Manager 会随 Tauri app 退出。Tauri DMG 暂未完成：本机 create-dmg 阶段曾失败，当前 bundle target 收窄为 `.app`；已新增 `docs/handoffs/main-agent-p3-tauri-mvp-host.md`。

## 36. Electron Active Code Cleanup 工作日志

- 2026-06-09 开始：用户确认应清理 Electron 代码，保持项目内容干净。本轮目标是把 Electron 从活跃工程路径移除：删除 `apps/electron`、Electron packaging/smoke/verify 脚本、root Electron scripts 和依赖、Desktop `electron-spike` surface/CSS；保留历史 handoff/checkpoint 作为废弃 spike 的原因记录。Tauri MVP 保持当前唯一活跃 macOS host 路线。
- 2026-06-09 收尾结束：Electron active code 已清理完成。已删除 `apps/electron`、`scripts/electron-packaging-smoke.mjs`、`scripts/package-electron-mac.mjs`、`scripts/verify-mac-artifact.mjs`，并删除旧 Electron generated artifacts `release/artifacts`、`release/staging`、`release/packager`；`release/build` icon 资源保留给 Tauri 使用。root `package.json` 已移除 `dev:electron`、Electron package/smoke/artifact/signed/verify scripts、`@electron/packager` 依赖，`build` 不再编译 Electron workspace，`package:mac` 现在指向 `build:tauri-mvp`。Desktop 已移除 `electron-spike` surface 和 CSS；design guard 不再检查 Electron main，只保护当前 Tauri/Desktop surface。`npm install` 移除了 114 个 Electron 相关 npm packages；`package-lock.json` stale `apps/electron` entry 已删除。验证结果：`npm run guard:design`、`npm run build:app -w @notch-ai-monitor/desktop`、`npm run build`、`npm run check -w @notch-ai-monitor/tauri-app`、`npm run build:tauri-mvp`、`git diff --check` 均通过；活跃代码/scripts/release 扫描无 Electron 引用。Tauri `.app` 已重新启动，app PID `53221`，app-managed Manager PID `53297`，Manager URL `http://127.0.0.1:51775`，`/health` ok。

## 37. Documentation Cleanup 工作日志

- 2026-06-09 开始：用户要求整理项目文档并删除过期内容。本轮先盘点 `docs/`、根 README、`design-qa.md`、当前 `package.json` scripts 与 Electron/Tauri 引用；确认当前活跃事实为 Tauri Web UI MVP host，Electron active code 已清理且不得恢复为产品宿主、packaging spike 或默认 `.app` 路线。删除标准收窄为：文档仍指向已删除的 Electron active code/scripts/artifacts，或根入口仍把旧 prototype/spec board 当当前项目事实；P0/P1/P2 合同与 checkpoint 作为历史证据暂不删除。
- 2026-06-09 整理结束：根 `README.md` 已从旧 prototype spec board 改为当前 Tauri/P2-P3 入口；新增 `docs/README.md` 与 `docs/handoffs/README.md` 作为文档索引；删除过期 `design-qa.md`、P2/P3 packaging prep handoff 和 4 个 Electron P3 standalone handoff；`docs/qa/p2-p3-beta-acceptance.md` 已改为 checkpoint/索引保留废弃原因，过期 Electron handoff 不再作为当前入口；`docs/product-audit.md` 的旧 `prototype/interactive.*` 链接已修为 `interactive-v2.*`；本 checkpoint 顶部和下一步入口已更新为 Tauri MVP release hardening，并把 27-34 节 Electron 细节压缩为废弃历史摘要。
- 2026-06-09 验证结束：自定义 Markdown 本地链接检查通过；`npm run guard:design` 通过，guarded file 为 `docs/qa/p2-p3-beta-acceptance.md`；`git diff --check` 通过。残留 Electron 相关引用只用于说明已删除文件/废弃路线，不再作为可执行入口。
