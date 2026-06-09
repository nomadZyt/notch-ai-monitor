# Main Agent Handoff: P2.1 View Log Contract

日期：2026-06-08  
Agent：Main Agent  
阶段：P2.1

## 本次目标

进入 P2 的第一步：把 `view-log` 从 P1 的 read-only/noop mock feedback 推进到一个安全、可审计、仍然 read-only 的日志查看合同。

边界：

- 不做真实 `retry` / `terminate` side effect。
- 不让 Desktop 直接操作 CLI 进程。
- 不让 Desktop 直接读、开、改本地日志文件。
- 不修改 shared model、API endpoint、protocol envelope、EventQueue/StateMachine 或 real CLI adapter。

## 已完成内容

- 新增 P2 checkpoint：`docs/handoffs/main-agent-context-checkpoint-p2.md`。
- 在 P1 checkpoint 中增加 P2 入口指针。
- 新增 P2 `view-log` 合同文档：
  - `view-log` 仍返回 `status=noop`。
  - event 保持 `active`。
  - Manager 负责选择并返回安全日志目标。
  - Desktop 只展示 Manager action result，不直接读/开文件。
- 在 `packages/local-manager-mock` 中实现 `view-log` 专用 result：
  - 优先从 `event.evidence.affectedPaths` 选择安全日志路径。
  - 安全路径命中时返回 `effects[0].type=filesystem`、`target=<safe path>`、`mocked=false`。
  - 无安全路径但有 `logExcerpt` 时回退到 `navigation` mocked effect。
  - 没有路径和摘录时返回 no-op feedback。
- 增加 local-manager-mock 单测：
  - 安全路径命中。
  - 不安全路径被跳过，fallback 到 `logExcerpt`。
- 更新 Desktop API client smoke：
  - API mode failed event 带安全日志路径。
  - 点击 `view-log` 后 live region 显示日志路径。
  - `eventCount` 保持 1，事件不被 resolve。

## 修改/新增文件

- 新增 `docs/contracts/view-log-p2.md`
- 新增 `docs/handoffs/main-agent-context-checkpoint-p2.md`
- 新增 `docs/handoffs/main-agent-view-log-contract-p2.md`
- 修改 `docs/handoffs/main-agent-context-checkpoint-p1.md`
- 修改 `packages/local-manager-mock/src/mock-local-agent-manager.ts`
- 修改 `packages/local-manager-mock/tests/mock-local-agent-manager.test.mjs`
- 修改 `apps/desktop/tests/e2e/api-client-smoke.spec.mjs`

## 关键决策

- P2.1 不扩协议，因为现有 `ActionResultPayload.effects[].target` 足够承载日志目标。
- `Evidence` 暂不新增 `logPath` 字段；当前优先复用 `affectedPaths` 里的安全日志路径。是否需要正式 `logPath` 字段留给 P2.4 real adapter hardening。
- `mocked=false` 只用于表达 Manager 返回了通过安全校验的 read-only filesystem target；Desktop 仍不得直接执行 OS open 或文件读取。
- 安全路径校验使用纯字符串规则，避免 `local-manager-mock` 引入 Node-only `fs/path`，从而保持 Desktop mock mode 可被浏览器打包。
- `view-log` 不 resolve event，因为查看日志只是获取上下文，不代表错误已处理。

## 暴露的接口或数据结构

没有新增 runtime API、protocol 或 shared model 字段。

稳定的 P2.1 action result 语义：

```json
{
  "status": "noop",
  "effects": [
    {
      "type": "filesystem",
      "target": "/Users/example/project/logs/error.log",
      "mocked": false
    }
  ]
}
```

fallback 语义：

```json
{
  "status": "noop",
  "effects": [
    {
      "type": "navigation",
      "target": "event:<eventId>#logExcerpt",
      "mocked": true
    }
  ]
}
```

安全路径规则记录在 `docs/contracts/view-log-p2.md`。

## 测试结果

通过：

- `npm run test -w @notch-ai-monitor/local-manager-mock`（13/13）
- `npm run build:app -w @notch-ai-monitor/desktop`
- `npm run test:qa`（10/10）
- API 直接验证：
  - `view-log` 返回 `status=noop`
  - `effects[0].type=filesystem`
  - `effects[0].target=/Users/example/notch-ai-monitor/logs/p2-view-log.log`
  - `effects[0].mocked=false`
  - event 保持 `active`
- in-app browser API mode 验证：
  - 初始 `eventCount=1`
  - 点击 `view-log` 后 live region 为 `日志位置：/Users/example/notch-ai-monitor/logs/p2-view-log.log`
  - `eventCount=1`
  - event body 仍显示日志摘录
  - browser console error：0
- `npm run smoke:view-log` 通过，确认 P1 fallback smoke 兼容。

收尾：

- 已调用 `POST /v1/debug/reset`。
- 当前主 API snapshot 为空 quiet：
  - `sessions=0`
  - `activeSessions=0`
  - `activeEvents=0`
  - `currentEventId=null`
- 当前服务：
  - Local Manager API：`http://127.0.0.1:4317`，PID `37390`
  - Desktop Vite：`http://127.0.0.1:5174`，PID `37547`

## 未解决问题

- 还没有真实日志文件读取 endpoint。
- 还没有 macOS `open` 或系统文件预览。
- `retry` / `terminate` 仍未实现真实 side effect。
- real CLI adapter 还不会提供正式 `logPath`；目前只能在事件已有 `affectedPaths` 安全日志路径时命中 filesystem target。
- Desktop 目前只展示 action result message，没有日志 viewer 面板。

## 下一位 agent 需要知道的上下文

- P2.1 已完成最小安全合同，可以进入 P2.2 设计 `retry` / `terminate`，但必须先定义确认、权限边界、进程归属校验和失败反馈。
- 如果继续增强 `view-log`，建议下一步不要让 Desktop 直接读文件；应先设计 Manager read-only log endpoint 或 real adapter log path 模型。
- `docs/handoffs/main-agent-context-checkpoint-p2.md` 是 P2 后续主 checkpoint。
