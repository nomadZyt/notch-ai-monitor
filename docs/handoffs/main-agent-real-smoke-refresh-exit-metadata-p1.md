# Main Agent P1.13 Real Smoke Refresh Exit Metadata Handoff

日期：2026-06-07  
Agent：Main Agent  
阶段：P1.13 Real Smoke Refresh / Exit Metadata Live Verification  
工作目录：`/Users/zhaiyongtao/vibeCoding/notch-ai-monitor`

## 1. 本次目标

- 进入下一步前核对并更新主 agent context checkpoint。
- 重启本地 API / Desktop，让 `127.0.0.1:4317` 和 `127.0.0.1:5174` 使用 P1.12 后的最新 build。
- 重新跑真实 `notch-run` smoke，让主 API snapshot 产生带 `Session.exitCode` 的 live completed session。
- 用 in-app browser 验证真实 `4317` 数据能在 Session Detail 显示 Exit Code。

## 2. 已完成内容

- 已核对 `docs/handoffs/main-agent-context-checkpoint-p1.md` 并标记 P1.13 执行中。
- 停止旧服务：
  - 旧 API PID：`63688`
  - 旧 Desktop PID：`64374`
- 启动新服务：
  - `npm run dev:api`
  - `npm run dev:qa`
- 新服务端口：
  - API：`http://127.0.0.1:4317`
  - Desktop：`http://127.0.0.1:5174`
- 运行真实 smoke：
  - `npm run smoke:notch-run`
  - 生成 session：`sess_real_codex_cli_wrapper_mq39kn4a_51640`
  - 生成 result event：`evt_real_codex_cli_result_20260607041029_0001`
- 主 API snapshot 已包含：
  - `state: completed`
  - `sourceMode: live`
  - `exitCode: 0`
  - `activeEvents: 1`
- in-app browser 验收真实 API：
  - 页面 URL：`http://127.0.0.1:5174/?manager=api&managerUrl=http%3A%2F%2F127.0.0.1%3A4317`
  - 初始状态：`data-state="glance"`、`data-mood="happy"`、`eventCount=1`
  - Session Detail 显示 `Exit Code0`

## 3. 修改/新增文件

| 文件 | 类型 | 说明 |
| --- | --- | --- |
| `docs/handoffs/main-agent-context-checkpoint-p1.md` | 修改 | 标记 P1.13 执行与后续上下文 |
| `docs/handoffs/main-agent-real-smoke-refresh-exit-metadata-p1.md` | 新增 | 本 handoff |

## 4. 关键决策

- P1.13 不改生产代码，只刷新真实 dev 服务并验证 P1.12 的 live behavior。
- completed smoke 只有 `exitCode: 0`，没有 `endReason`，这是当前 adapter 行为：只有 signal 才写 `reason`。
- 不在本阶段补失败码 smoke fixture，避免把 “服务刷新验证” 和 “失败路径 fixture 扩展” 混在一起。
- 保留新启动的 API/Desktop 服务，供用户当前浏览器继续使用。

## 5. 暴露的接口或数据结构

- 无新增接口。
- 已验证现有接口：
  - `GET /v1/snapshot`
  - `POST /v1/envelopes`
  - `notch.session.ended -> Session.exitCode`

## 6. 测试结果

- `npm run smoke:notch-run`：通过。
- `curl http://127.0.0.1:4317/v1/snapshot`：通过，snapshot session 包含 `exitCode: 0`。
- in-app browser 手工验收：通过，真实 `4317` 数据在 Session Detail 中显示 `Exit Code0`。

## 7. 未解决问题

- 还没有真实 failed smoke。当前只能确认 completed path 的 `exitCode: 0` live 链路。
- `endReason` 的 live 验证仍依赖 signal/failed path，P1.13 未覆盖。
- Detail 暂无 “Attach/打开终端” 操作。
- 左侧 tool stack 仍是静态图标。

## 8. 下一位 agent 需要知道的上下文

- 下一步进入开发前仍要先更新 `main-agent-context-checkpoint-p1.md`。
- 推荐下一步：P1.14 Failed Exit Smoke Fixture。
- P1.14 可新增一个安全失败命令 preset，例如 Node 进程 `process.exit(7)`，验证：
  - `Session.state=failed`
  - `Session.exitCode=7`
  - 如 adapter 生成 reason，则验证 `Session.endReason`
  - Desktop detail 显示 failed + exit code
- 不要在 P1.14 做 PTY attach。
