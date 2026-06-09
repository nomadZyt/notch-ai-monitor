# Notch AI Monitor P1 Action Side Effect Boundary

日期：2026-06-07  
阶段：P1

## 1. 目标

P1 只验证 UI -> Local Manager API -> ActionResult -> EventQueue 的闭环。  
除明确标记为 read-only 的动作外，所有可能触达外部系统的动作必须保持 mocked，不得直接控制真实进程、窗口或文件。

## 2. 通用规则

- `ActionResultPayload.effects[].mocked` 必须准确表达是否真实执行了副作用。
- P1 中 `sideEffect: "process"` 一律返回 mocked effect。
- P1 中 `sideEffect: "navigation"` 可以用于 read-only UI feedback，但不聚焦真实终端、不打开外部文件。
- P1 中 `sideEffect: "clipboard"` 可以在 UI 层未来接真实复制，但 Manager 不直接写剪贴板。
- `terminate` 必须要求 `confirmed: true`。
- `allow-once` 必须要求 `confirmed: true`。
- 未确认的危险动作返回 `needs_confirmation`，事件保持 active。

## 3. Error Action Boundary

| action | P1 status | event status | effect | confirmed | 说明 |
| --- | --- | --- | --- | --- | --- |
| `retry` | `completed` | `resolved` | `process`, `mocked: true` | 否 | 只记录“已模拟重试”，不重新启动真实命令 |
| `view-log` | `noop` | `active` | `navigation`, `mocked: true` | 否 | read-only 入口，只展示/反馈已有 log excerpt |
| `terminate` | `needs_confirmation` | `active` | `process`, `mocked: true` | 否 | 第一次点击只请求确认 |
| `terminate` | `completed` | `resolved` | `process`, `mocked: true` | 是 | P1 仍不 kill 真实进程 |
| `ignore` | `completed` | `ignored` | `none`, `mocked: true` | 否 | 只处理 Manager 队列状态 |

## 4. Result Action Boundary

| action | P1 status | event status | effect | 说明 |
| --- | --- | --- | --- | --- |
| `open-result` | `completed` | `resolved` | `navigation`, `mocked: true` | 不打开真实文件或 URL |
| `mark-read` | `completed` | `resolved` | `none`, `mocked: true` | 只更新队列状态 |
| `copy-summary` | `noop` | `active` | `clipboard`, `mocked: true` | Manager 不写剪贴板 |
| `locate` | `noop` | `active` | `navigation`, `mocked: true` | 不聚焦真实窗口 |

## 5. Confirm/Risk Action Boundary

| action | P1 status | event status | effect | confirmed | 说明 |
| --- | --- | --- | --- | --- | --- |
| `approve` | `completed` | `resolved` | `process`, `mocked: true` | 否 | 不把批准回写到真实 CLI stdin |
| `reject` | `completed` | `ignored` | `process`, `mocked: true` | 否 | 只处理 Manager 队列状态 |
| `allow-once` | `needs_confirmation` | `active` | `process`, `mocked: true` | 否 | 第一次点击只请求确认 |
| `allow-once` | `completed` | `resolved` | `process`, `mocked: true` | 是 | P1 不执行真实危险命令 |
| `copy` | `noop` | `active` | `clipboard`, `mocked: true` | 否 | Manager 不写剪贴板 |
| `locate` | `noop` | `active` | `navigation`, `mocked: true` | 否 | 不聚焦真实窗口 |

## 6. P2 前置条件

任何真实 side effect 进入 P2 前，需要先有：

- 明确的 user confirmation contract。
- 操作权限/作用域边界。
- 可审计日志。
- 失败回滚或至少失败反馈。
- 对 UI 的 `failed` / `rejected` / `needs_confirmation` 展示覆盖。
