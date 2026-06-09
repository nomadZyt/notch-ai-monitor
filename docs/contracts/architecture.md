# Notch AI Monitor P0 架构契约

版本：v0.1  
日期：2026-06-06  
适用阶段：P0 技术 Spike  
依据：

- [docs/product-requirements-v2.md](../product-requirements-v2.md)
- [docs/technical-options-and-task-plan.md](../technical-options-and-task-plan.md)
- [design/notch-ai-monitor-hifi.html](../../design/notch-ai-monitor-hifi.html)
- [prototype/interactive-v2.html](../../prototype/interactive-v2.html)
- [prototype/interactive-v2.js](../../prototype/interactive-v2.js)
- [prototype/interactive-v2.css](../../prototype/interactive-v2.css)

## 1. P0 范围

P0 只验证开发 pipeline 和事件闭环，不实现完整产品。

P0 必须验证：

```text
mock CLI event
  -> Local Agent Manager
  -> EventQueue
  -> Notch UI
  -> 用户点击动作
  -> action result
  -> event resolved
  -> 自动切换下一条事件或 dormant
```

P0 不做：

- 真实 Claude/Codex/Qwen adapter。
- 真实终端窗口定位。
- 真实命令执行、删除文件、终止进程。
- 持久化数据库。
- 云同步、团队协作、高级历史搜索。
- SwiftUI/AppKit 正式重写。

## 2. 推荐 P0 技术路线

技术路线文档给出两条可行路径：正式产品优先 SwiftUI/AppKit，最快 Spike 优先 Tauri + Web UI + mock Local Agent Manager。

P0 推荐采用：

```text
Tauri 或本地静态 Web shell
  + Web UI from interactive-v2
  + mock Local Agent Manager
  + shared TypeScript event model
  + in-memory EventQueue
  + DebugHarness fixtures
```

如果 P0-01 暂时不搭 Tauri，也可以用静态 Web + Node mock server 验证同一协议。协议和模块边界不能依赖某个 transport。

## 3. 推荐工程结构

本节是后续 P0-01 建工程骨架时的推荐结构。本 Architecture Agent 不创建源码目录。

```text
notch-ai-monitor/
  docs/
    contracts/
      architecture.md
      event-protocol.md
    handoffs/
      TEMPLATE.md
      architecture-agent-p0.md

  apps/
    desktop/
      src/
        app/
          bootstrap.ts
          app-shell.ts
        ui/
          notch/
          panels/
          a11y/
          styles/
        state/
          ui-store.ts
          selectors.ts
        debug/
          debug-harness.ts
      src-tauri/
        src/
          manager/
          ipc/
          risk/

  packages/
    shared/
      src/
        models/
          session.ts
          event.ts
          evidence.ts
          action.ts
        protocol/
          envelope.ts
          cli-to-manager.ts
          ui-to-manager.ts
          manager-to-ui.ts
        state-machine/
          mood.ts
          view-state.ts
        event-queue/
          priority.ts
          dedupe.ts
          queue.ts

  fixtures/
    events/
      all-events.json
      risk.json
      confirm.json
      result.json
      error.json

  tests/
    shared/
    manager/
    ui/
```

如果团队选择更轻量的单包结构，可以把 `packages/shared/src/*` 平移到 `src/shared/*`，但依赖方向必须保持一致。

## 4. 模块边界

| 模块 | P0 职责 | 不负责 |
| --- | --- | --- |
| `NotchUI` | 胶囊、表情、面板、分页、动作按钮、toast、live region | 修改事件队列真值、执行 CLI 动作 |
| `UIStore` | 当前 `panel`、焦点、用户选择的 `selectedEventId`、本地 view state | 事件创建、resolve 持久状态 |
| `StateMachine` | 从当前事件计算 `mood`、静息 `state`、可见性 hint | DOM 操作、网络请求 |
| `LocalAgentManager` | P0 的 session/event/action runtime 真值 | 真实 AI agent 任务执行 |
| `SessionRegistry` | 注册、更新、结束本地 CLI session | 发现真实终端窗口 |
| `EventQueue` | active 过滤、排序、去重、resolve、next event | 渲染 UI |
| `ActionRouter` | 接收 UI action request，返回 action result，更新事件状态 | 未经确认执行危险副作用 |
| `RiskScanner` | P0 识别 `rm -rf`、`git clean -fd`、`sudo` 并补证据 | 完整安全策略引擎 |
| `CLIAdapter` | P0 只做 JSON/fixture/stdin mock adapter | 接真实 Claude/Codex/Qwen |
| `DebugHarness` | 注入四类事件和 all-events 场景 | 正式产品入口 |

## 5. 依赖方向

唯一允许的主链路：

```text
CLIAdapter/mock fixtures
  -> LocalAgentManager
  -> SessionRegistry / EventQueue / RiskScanner / ActionRouter
  -> protocol snapshot
  -> UIStore
  -> NotchUI
```

用户动作反向只允许通过协议：

```text
NotchUI
  -> UIStore
  -> notch.action.requested
  -> LocalAgentManager / ActionRouter
  -> notch.action.result
  -> EventQueue update
  -> snapshot update
```

禁止依赖：

- `shared/*` 不得 import `ui/*`、`manager/*`、Tauri API、DOM API。
- `ui/*` 不得直接 mutate `EventQueue` 内部对象。
- `manager/*` 不得依赖 DOM、CSS class、prototype HTML id。
- `risk/*` 不得打开 UI 或执行用户动作，只返回 risk assessment。
- `debug/*` 不得进入正式 runtime 默认入口。

## 6. 数据真值 ownership

| 数据 | P0 真值 owner | UI 可否本地保存 | 说明 |
| --- | --- | --- | --- |
| `Session` | `LocalAgentManager` | 只读 snapshot | UI 可以排序展示，但不能改 session state |
| `Event` | `LocalAgentManager/EventQueue` | 只读 snapshot | UI action 后等待 manager result |
| `Evidence` | `LocalAgentManager/RiskScanner` | 只读 snapshot | 风险/确认/错误必须展示 |
| `Action` | `LocalAgentManager` | 只读 snapshot | UI 只根据 `enabled`、`style` 渲染 |
| `ActionResult` | `ActionRouter` | 读取并 toast/live region | 结果驱动事件状态更新 |
| `selectedEventId` | `UIStore` | 可以 | 用户分页、tab 切换用，事件失效后重选 |
| `panel` | `UIStore` | 可以 | `none`、`sessions`、`action` |
| `mood/state` | `StateMachine` 派生 | 可以缓存 | 从 current active event 派生，不做持久真值 |

## 7. P0 状态机契约

沿用 PRD 和 `interactive-v2.js`：

```text
Event.type -> mood:
  risk    -> angry
  confirm -> waiting
  result  -> happy
  error   -> sad
  none    -> none

mood -> resting state:
  none    -> dormant
  angry   -> peek
  waiting -> glance
  happy   -> glance
  sad     -> glance
```

展示 state：

- `dormant`：无 active event，关闭面板。
- `glance`：非风险事件静息态。
- `peek`：风险默认态，或 hover/focus 触发。
- `expanded`：打开 `sessions` 或 `action` 面板。

`panel` 只能是：

- `none`
- `sessions`
- `action`

状态机必须做成纯函数，便于 State Agent 和 QA Agent 单测。

## 8. EventQueue 契约

active event 是 `status === "active"` 的事件。

默认优先级：

| type | priority | 静息展示 |
| --- | ---: | --- |
| `risk` | 100 | `peek` |
| `confirm` | 80 | `glance` |
| `error` | 70 | `glance` |
| `result` | 55 | `glance` |

排序规则：

1. 只展示 active event。
2. 按 `priority` 从高到低。
3. 同优先级按 `createdAt` 从新到旧。
4. 风险事件不被普通事件覆盖。
5. 胶囊只展示排序后的第一条事件。
6. 数量显示全部 active event 数。

P0 去重规则：

| 场景 | key | 处理 |
| --- | --- | --- |
| 重复完成提醒 | `sessionId + type=result` | 旧事件 `expired`，保留最新 |
| 重复确认命令 | `sessionId + commandHash` | 合并，更新 `updatedAt` |
| 同一错误持续出现 | `sessionId + type=error + errorKey` | 合并，增加 `occurrenceCount` |
| 风险命令 | 不去重 | 逐条处理 |

## 9. UI 契约

UI 只消费 manager snapshot 和 action result。

UI 必须保留当前原型已验证的交互：

- 右胶囊点击打开操作面板。
- 左胶囊点击打开会话面板。
- 无事件时点击右胶囊只 toast，不打开面板。
- hover/focus 让非风险事件从 `glance` 到 `peek`。
- `Esc` 收起面板并回到当前 mood 静息 state。
- `ArrowLeft` / `ArrowRight` 在操作面板内切换 active event。
- action resolve 后自动选下一条 active event；无剩余事件回 `dormant`。

UI 不应假设 action 总是成功。必须处理 `notch.action.result` 的 `failed`、`noop`、`needs_confirmation`。

## 10. Manager 契约

P0 manager 是 mock runtime，但接口要像真实 runtime：

- 接收 `notch.session.upserted` 创建或更新 session。
- 接收 `notch.event.created` 标准化事件。
- 对 command event 可调用 `RiskScanner` 升级为 risk event。
- 维护 event status。
- 接收 `notch.action.requested`。
- 返回 `notch.action.result`。
- 广播 `notch.snapshot.updated`。

P0 action 不执行真实副作用：

- `approve`、`reject`、`allow-once`、`open-result`、`mark-read`、`retry`、`ignore` 只更新事件状态并产出 result。
- `copy`、`copy-summary`、`locate`、`view-log` 可以返回 `noop` 或 mock feedback。
- `terminate`、`allow-once` 必须要求 `confirmed: true`。

## 11. 文件 ownership

| 路径 | Owner agent | 可改内容 |
| --- | --- | --- |
| `docs/contracts/architecture.md` | Architecture Agent | 架构边界、模块职责、依赖方向 |
| `docs/contracts/event-protocol.md` | Architecture Agent + State/Manager Agent 协商 | TypeScript shape、事件 envelope、样例 |
| `docs/handoffs/*` | 各 agent | 交接记录 |
| `packages/shared/src/models/*` | State Agent | Session/Event/Evidence/Action 类型 |
| `packages/shared/src/state-machine/*` | State Agent | mood/state/panel 纯函数 |
| `packages/shared/src/event-queue/*` | State Agent | 排序、去重、resolve 纯逻辑 |
| `apps/desktop/src/ui/*` | UI Agent | 胶囊、面板、a11y、样式 |
| `apps/desktop/src/state/*` | UI Agent + State Agent | UI store、selectors |
| `apps/desktop/src-tauri/src/manager/*` | Manager Agent | mock manager runtime |
| `apps/desktop/src-tauri/src/ipc/*` | Manager Agent | transport bridge |
| `apps/desktop/src-tauri/src/risk/*` | Risk Agent | P0 risk scanner |
| `fixtures/events/*` | QA Agent + Manager Agent | 四类事件 fixture |
| `tests/*` | 对应 owner agent | 对应模块测试 |

并行工作时，如果某 agent 需要修改非 owner 文件，先在 handoff 中写明原因，避免覆盖其他 agent 的实现。

## 12. P0 验收清单

- 能注入 `risk`、`confirm`、`result`、`error` 四类事件。
- UI 按 priority 展示最高优先级事件。
- risk 事件默认 `peek`。
- 非 risk 事件默认 `glance`，hover/focus 可 `peek`。
- 点击 action 后 manager 返回 action result。
- resolve 后队列自动选择下一条 active event。
- 最后一条 event resolve 后 UI 回 `dormant`。
- DebugHarness 可以稳定切换安静、确认、完成、错误、风险、全部事件。
- P0 所有风险动作都是 mock，不执行真实危险副作用。

## 13. 后续 agent 入口建议

- State Agent：先实现 `packages/shared/src/models/*`、`state-machine/*`、`event-queue/*`，从 `EVENT_SEED` 迁移 fixture。
- Manager Agent：实现 mock manager，接 fixture event，广播 snapshot，处理 action result。
- UI Agent：迁移 `interactive-v2` 的 DOM/样式/交互到工程结构，改为消费 snapshot。
- Risk Agent：只做 P0 三条规则：`rm -rf`、`git clean -fd`、`sudo`。
- QA Agent：基于 fixture 覆盖四类事件、排序、resolve、状态机和响应式检查。
