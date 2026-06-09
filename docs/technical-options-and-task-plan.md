# Notch AI Monitor 技术路线与开发任务拆分

日期：2026-06-06  
依据：

- 产品需求：[docs/product-requirements-v2.md](./product-requirements-v2.md)
- 高保真方向稿：[design/notch-ai-monitor-hifi.html](../design/notch-ai-monitor-hifi.html)
- 当前交互原型：[prototype/interactive-v2.html](../prototype/interactive-v2.html)

## 1. 结论摘要

Notch AI Monitor 的真实产品形态不是“再做一个 AI agent”，而是：

> 管理本地 Claude/Codex/Qwen 等 AI CLI agent 的 macOS 控制面。

建议命名为：

- 产品 UI 层：`Notch UI`
- 本地管理层：`Local Agent Manager`
- 工具适配层：`CLI Adapters`
- 风险策略层：`Risk Scanner / Risk Policy`

推荐路线分两段：

| 阶段 | 推荐路线 | 目标 |
| --- | --- | --- |
| 技术 Spike | Tauri + Web UI + mock Local Agent Manager | 快速验证事件闭环和原型迁移成本 |
| 正式 MVP | SwiftUI/AppKit Host + Local Agent Manager + shared event model | 获得最好的 macOS 质感、窗口控制和系统集成 |

如果团队目前 Web 能力更强、目标是先出 DMG 内测版，可以先用 Tauri 做 MVP；如果目标是一开始就做到“像 Mac 原生产品”，应优先 SwiftUI/AppKit。

## 2. 为什么是 Local Agent Manager

### 2.1 它不是新的 AI agent

Notch AI Monitor 不负责生成代码、执行任务或自主决策。真正的 AI agent 是 Claude CLI、Codex CLI、Qwen CLI 等工具。

Local Agent Manager 的职责是管理和协调这些本地 AI CLI agent：

```text
AI CLI Agents
  -> CLI Adapters
  -> Local Agent Manager
  -> EventQueue / RiskPolicy / ActionRouter
  -> Notch UI
```

### 2.2 它为什么必要

如果产品只做 UI 原型，不需要 Local Agent Manager。  
如果产品要真实使用，就需要它处理以下能力：

| 能力 | 没有 Local Agent Manager 会怎样 |
| --- | --- |
| 发现本地 CLI 会话 | UI 不知道当前有哪些 AI 工具在运行 |
| 接收确认/完成/错误/风险事件 | UI 只能靠手动 mock，不能自动提醒 |
| 事件排序和去重 | 多个会话同时运行时无法判断显示谁 |
| 用户动作分发 | 批准、拒绝、重试、定位无法回到对应 CLI |
| 风险扫描 | 无法在命令执行前形成证据和拦截 |
| UI 隐藏时继续监听 | 产品默认低打扰，不能依赖主窗口一直打开 |

### 2.3 Local Agent Manager 的边界

它应该做：

- 管理会话生命周期。
- 接收和标准化事件。
- 维护事件队列。
- 运行风险策略。
- 分发用户动作。
- 持久化偏好和事件状态。

它不应该做：

- 自己成为新的 AI agent。
- 替用户自动生成代码。
- 绕过用户确认执行风险命令。
- 上传命令、日志、路径等敏感数据。

## 3. 技术路线对比

### 3.1 路线 A：SwiftUI + AppKit 原生 macOS

| 维度 | 评价 |
| --- | --- |
| Mac 质感 | 最强 |
| 刘海/顶部悬浮窗口 | 最适合 |
| 毛玻璃和系统面板 | 最自然 |
| 菜单栏能力 | 最自然 |
| 权限和终端定位 | 最适合 |
| 复用当前 HTML/CSS | 低 |
| 开发速度 | 中等偏慢 |
| 长期维护 | 强 |

适合场景：

- 产品只面向 Mac。
- 对“简单高级、低打扰、像原生系统控件”要求非常高。
- 需要稳定处理顶部浮窗、窗口层级、菜单栏、权限、终端定位。
- 希望未来有 App Store 或更正式的 macOS 分发可能。

技术组成：

| 层 | 建议 |
| --- | --- |
| UI | SwiftUI + AppKit |
| 顶部窗口 | `NSPanel` / borderless floating window |
| 菜单栏 | `MenuBarExtra` 或 AppKit status item |
| 玻璃效果 | `NSVisualEffectView` |
| 状态管理 | Swift observable store |
| 本地管理 | Swift service 或 Rust helper |
| 存储 | SQLite / UserDefaults |
| CLI 通信 | Unix domain socket / local JSON protocol |

主要风险：

- 当前 Web 原型不能直接复用，需要重新实现 UI。
- SwiftUI 对复杂自定义浮层有时仍需 AppKit 兜底。
- 前期开发成本比 Tauri/Electron 高。

结论：

> 如果目标是最终产品质感，SwiftUI + AppKit 是长期最稳路线。

### 3.2 路线 B：Tauri + Web UI + Rust

| 维度 | 评价 |
| --- | --- |
| Mac 质感 | 中高 |
| 刘海/顶部悬浮窗口 | 可做，但需要原生桥接 |
| 毛玻璃和透明窗口 | 可做，但要注意 macOS 私有 API 和分发风险 |
| 菜单栏能力 | 可做 |
| 权限和终端定位 | Rust/插件可做，需要实现 |
| 复用当前 HTML/CSS | 高 |
| 开发速度 | 快 |
| 长期维护 | 中高 |

适合场景：

- 想快速把当前 HTML/CSS 原型迁成可运行桌面 app。
- 先做 DMG 内测，不急于 App Store。
- 团队 Web 前端能力强。
- 需要一个轻量桌面壳和 Rust 本地能力。

技术组成：

| 层 | 建议 |
| --- | --- |
| UI | HTML/CSS/TypeScript |
| 桌面壳 | Tauri |
| 本地管理 | Rust commands / sidecar |
| 存储 | SQLite / Tauri store |
| IPC | Tauri command/event |
| CLI 通信 | Unix domain socket / localhost loopback / stdio bridge |
| 风险扫描 | Rust module |

主要风险：

- 透明 WebView、毛玻璃、特殊窗口层级可能需要平台代码。
- 真正贴近 Mac 原生的细节比 SwiftUI 难。
- 如果走 App Store，要谨慎检查透明窗口和私有 API 使用。

结论：

> Tauri 是最快把当前原型推进到可测试 MVP 的路线，但最终 macOS 质感需要额外打磨。

### 3.3 路线 C：Electron + Web UI + Node.js

| 维度 | 评价 |
| --- | --- |
| Mac 质感 | 中 |
| 刘海/顶部悬浮窗口 | 可做 |
| 毛玻璃和系统面板 | 可做但容易不原生 |
| 菜单栏能力 | 成熟 |
| 权限和终端定位 | Node 生态方便 |
| 复用当前 HTML/CSS | 最高 |
| 开发速度 | 最快 |
| 包体/内存 | 最重 |

适合场景：

- 极度追求开发速度。
- 团队已有 Electron 经验。
- 不在意包体、内存和原生质感损耗。
- 产品先做功能验证而非精致 Mac 工具。

技术组成：

| 层 | 建议 |
| --- | --- |
| UI | HTML/CSS/TypeScript |
| 桌面壳 | Electron |
| 本地管理 | Node main process |
| 存储 | SQLite / better-sqlite3 |
| IPC | Electron IPC |
| CLI 通信 | child_process / sockets / file watchers |
| 风险扫描 | Node module |

主要风险：

- 对“简单高级、低打扰”的 Mac 产品来说偏重。
- Chromium + Node 打包体积大。
- 顶部常驻小控件会让性能和资源占用更敏感。

结论：

> Electron 适合最快验证，但不建议作为最终首选，除非团队明确以速度优先。

### 3.4 路线 D：纯 Web

| 维度 | 评价 |
| --- | --- |
| Mac 质感 | 低 |
| 本地 CLI 管理 | 基本不可行 |
| 系统窗口能力 | 不可行 |
| 开发速度 | 快 |

结论：

> 纯 Web 只能继续做交互原型，不能作为真实产品路线。

## 4. 推荐方案

### 4.1 推荐一：正式产品路线

```text
SwiftUI/AppKit Host
  + Local Agent Manager
  + CLI Adapters
  + Risk Scanner
  + SQLite/UserDefaults
```

推荐理由：

- 产品明确面向 Mac 用户。
- UI 位于刘海/菜单栏附近，对窗口层级、玻璃、动效和系统感要求高。
- 需要定位终端、处理权限、管理本地进程。
- 长期更容易做成“像系统自带的小工具”。

### 4.2 推荐二：最快 MVP 路线

```text
Tauri
  + Web UI
  + Rust Local Agent Manager
  + shared JSON event protocol
```

推荐理由：

- 当前 `interactive-v2.html` 和高保真方向稿可以较快迁移。
- 可以快速验证事件队列、状态机、胶囊、面板、动作闭环。
- Rust 适合实现本地管理、风险扫描和 IPC。
- 包体和资源占用通常比 Electron 更适合轻量工具。

### 4.3 不推荐作为首选

Electron 不建议作为首选，除非团队优先级是“尽快做出可用 demo”，并且暂时接受较大包体和较重资源占用。

## 5. MVP 架构

```text
┌─────────────────────────────────────────────┐
│                Notch UI                     │
│  Capsule / Panels / State Machine / A11y    │
└──────────────────────┬──────────────────────┘
                       │ UI events / app state
┌──────────────────────▼──────────────────────┐
│              Event Store                    │
│  active events / selected event / sessions  │
└──────────────────────┬──────────────────────┘
                       │ normalized events/actions
┌──────────────────────▼──────────────────────┐
│          Local Agent Manager                │
│  Session registry / EventQueue / ActionRouter│
└───────────────┬───────────────┬─────────────┘
                │               │
┌───────────────▼──────┐ ┌──────▼─────────────┐
│     CLI Adapters     │ │    Risk Scanner    │
│ Claude/Codex/Qwen    │ │ command policy     │
└───────────────┬──────┘ └──────┬─────────────┘
                │               │
┌───────────────▼───────────────▼─────────────┐
│           Local AI CLI Agents               │
│ Claude CLI / Codex CLI / Qwen CLI / custom  │
└─────────────────────────────────────────────┘
```

## 6. 模块职责

| 模块 | 职责 | MVP 实现 |
| --- | --- | --- |
| `NotchUI` | 胶囊、表情、面板、键盘、toast | Web UI 或 SwiftUI |
| `StateMachine` | `mood/state/panel` 计算 | 纯函数，单测覆盖 |
| `EventStore` | 当前会话、事件、选择状态 | UI store |
| `LocalAgentManager` | 管理会话和事件生命周期 | Rust/Swift service |
| `SessionRegistry` | 注册和更新会话 | 本地内存 + SQLite |
| `EventQueue` | 排序、去重、resolve | 纯逻辑模块 |
| `ActionRouter` | 批准、拒绝、打开、重试、定位 | MVP 先 mock，后接真实 |
| `CLIAdapter` | 把不同 CLI 事件转成统一协议 | 先做 JSON/stdio adapter |
| `RiskScanner` | 命令风险识别和影响范围 | 规则优先 |
| `PreferencesStore` | 偏好和用户策略 | UserDefaults/SQLite |
| `DebugHarness` | 演示场景、mock 事件 | 开发模式启用 |

## 7. 推荐事件协议

### 7.1 CLI 到 Local Agent Manager

```json
{
  "event": "notch.event.created",
  "payload": {
    "id": "evt_123",
    "sessionId": "sess_qwen_001",
    "type": "confirm",
    "priority": 80,
    "title": "需要确认",
    "summary": "Qwen 想运行草稿整理脚本。",
    "command": "python scripts/prepare_xhs_batch.py --drafts ./drafts --limit 6",
    "source": "Terminal · autoXhs",
    "evidence": {
      "reason": "命令会读取 drafts 目录并生成批处理输出。",
      "impact": "./drafts、./outputs/xhs-batch",
      "origin": "AI 生成，等待用户批准",
      "rollback": "输出目录可删除，不影响源文件"
    }
  }
}
```

### 7.2 UI 到 Local Agent Manager

```json
{
  "event": "notch.action.requested",
  "payload": {
    "eventId": "evt_123",
    "actionId": "approve",
    "confirmed": true
  }
}
```

### 7.3 Local Agent Manager 到 CLI

```json
{
  "event": "notch.action.result",
  "payload": {
    "eventId": "evt_123",
    "actionId": "approve",
    "status": "accepted"
  }
}
```

## 8. 技术 Spike

### 8.1 Spike 目标

先验证最关键闭环：

```text
mock CLI event
  -> Local Agent Manager
  -> EventQueue
  -> Notch UI
  -> 用户点击动作
  -> Event resolved
```

### 8.2 Spike 推荐实现

| 项目 | 选择 |
| --- | --- |
| 框架 | Tauri 或纯本地静态 Web + Node mock server |
| UI | 迁移 `interactive-v2` |
| 事件输入 | 本地 JSON POST 或 WebSocket |
| 状态机 | 从 `interactive-v2.js` 抽成模块 |
| 风险扫描 | 先识别 `rm -rf`、`git clean -fd`、`sudo` |
| 持久化 | 暂用内存 |

### 8.3 Spike 验收

- 可以注入四类事件：risk、confirm、result、error。
- UI 按优先级展示事件。
- 风险事件默认探出。
- 点击动作后事件 resolve。
- 队列自动切换下一事件。
- 所有状态在高保真方向 01 的视觉语言下可展示。

## 9. 开发任务拆分

### P0：技术基础和事件闭环

| ID | 任务 | 技术范围 | 依赖 | 验收 |
| --- | --- | --- | --- | --- |
| P0-01 | 建立工程骨架 | 选择 SwiftUI/AppKit 或 Tauri；建立目录、构建脚本 | 无 | 本地能启动空应用 |
| P0-02 | 定义共享数据模型 | Session、Event、Action、Evidence、Preference | P0-01 | 类型定义和样例 JSON 完成 |
| P0-03 | 抽离状态机 | mood/state/panel、静息状态映射 | P0-02 | 单测覆盖 5 种 mood 和 4 种 state |
| P0-04 | 实现 EventQueue | active 过滤、排序、去重、resolve | P0-02 | risk > confirm > error > result |
| P0-05 | 实现 mock Local Agent Manager | 接收 mock 事件、维护 session/event | P0-02, P0-04 | 可注入和 resolve 事件 |
| P0-06 | 迁移 Notch UI 基础 | 刘海、左右胶囊、状态矩阵、面板骨架 | P0-03 | 能展示 dormant/glance/peek/expanded |
| P0-07 | 实现操作面板 | 事件详情、分页、动作按钮 | P0-04, P0-06 | 可处理当前事件 |
| P0-08 | 实现动作闭环 | approve/reject/open/mark-read/retry mock | P0-05, P0-07 | 动作后事件状态正确 |
| P0-09 | 风险规则 MVP | rm/git clean/sudo 规则 | P0-05 | 高风险命令生成 risk 事件 |
| P0-10 | DebugHarness | 安静/确认/完成/错误/风险/全部事件 | P0-06 | QA 可稳定切状态 |

### P1：真实本地能力

| ID | 任务 | 技术范围 | 依赖 | 验收 |
| --- | --- | --- | --- | --- |
| P1-01 | 持久化存储 | SQLite/UserDefaults/Tauri store | P0-02 | 重启后偏好和事件状态保留 |
| P1-02 | 本地管理 API | Unix socket / localhost / app IPC | P0-05 | CLI 可主动上报 JSON 事件 |
| P1-03 | CLI Adapter v1 | 先接一个工具，建议 Codex 或 Claude | P1-02 | 能创建真实 Session |
| P1-04 | 会话注册和心跳 | session create/update/finish | P1-03 | UI 会话列表实时更新 |
| P1-05 | 命令确认回写 | approve/reject 回到 CLI | P1-03 | CLI 收到用户动作 |
| P1-06 | 完成结果打开 | open file/path/url | P0-08 | 成功打开结果并 resolve |
| P1-07 | 错误日志入口 | log excerpt / log file | P1-03 | 错误面板可查看日志 |
| P1-08 | 偏好设置 MVP | 监控工具开关、风险探出、完成自动收回 | P1-01 | 修改后即时生效 |
| P1-09 | 键盘和可访问性 | Tab、Enter、Esc、Arrow、live region | P0-07 | 不用鼠标可处理事件 |
| P1-10 | 响应式/显示器适配 | 有刘海/无刘海/窄宽度 | P0-06 | 不溢出，不遮挡菜单栏 |

### P2：产品化增强

| ID | 任务 | 技术范围 | 依赖 | 验收 |
| --- | --- | --- | --- | --- |
| P2-01 | 终端窗口定位 | Terminal/iTerm 窗口识别和聚焦 | P1-03 | locate 能聚焦来源窗口 |
| P2-02 | 多工具 adapter | Claude/Codex/Qwen/custom | P1-03 | 三个工具可同时注册 |
| P2-03 | 风险影响范围推导 | affected paths、rollback、risk level | P0-09 | 面板证据更完整 |
| P2-04 | 二次确认系统 | allow once、terminate 等敏感动作 | P1-05 | 未确认不得执行 |
| P2-05 | 通知策略 | 完成自动过期、静音普通运行 | P1-08 | 策略符合偏好 |
| P2-06 | 视觉回归测试 | 截图覆盖所有状态 | P0-10 | CI/脚本生成对比截图 |
| P2-07 | 安装和权限引导 | DMG、首次启动、隐私权限说明 | P1 主链路 | 用户能完成授权 |
| P2-08 | 无刘海模式 | 外接显示器顶部胶囊 | P1-10 | 无刘海屏幕不显示假刘海 |

## 10. 技术选型评分

评分：5 分最好。

| 维度 | 权重 | SwiftUI/AppKit | Tauri | Electron |
| --- | ---: | ---: | ---: | ---: |
| Mac 原生质感 | 25% | 5 | 3.5 | 3 |
| 顶部悬浮/刘海窗口 | 20% | 5 | 3.5 | 3.5 |
| 复用当前原型 | 15% | 2 | 5 | 5 |
| 本地管理能力 | 15% | 4.5 | 4.5 | 4 |
| 开发速度 | 10% | 3 | 4 | 5 |
| 包体/资源占用 | 10% | 5 | 4 | 2 |
| 长期可维护性 | 5% | 4.5 | 4 | 3.5 |

综合建议：

| 排名 | 路线 | 说明 |
| --- | --- | --- |
| 1 | SwiftUI/AppKit | 正式产品最佳 |
| 2 | Tauri | MVP 验证最快且相对轻量 |
| 3 | Electron | 最快 demo，但不符合长期气质 |

## 11. 推荐执行顺序

### 第 1 周：技术 Spike

- 建工程骨架。
- 抽状态机和事件队列。
- 做 mock Local Agent Manager。
- 注入四类事件。
- 完成 UI 事件 resolve 闭环。

### 第 2 周：MVP UI 和队列

- 完成 Quiet Glass 方向的基础 UI。
- 操作面板、会话面板、分页、动作按钮。
- DebugHarness 和视觉 QA。

### 第 3 周：真实 CLI 接入

- 选一个 CLI 做 adapter。
- 本地管理 API。
- 会话注册、事件上报、动作回写。

### 第 4 周：风险和偏好

- 风险规则 MVP。
- 偏好设置。
- 键盘可访问性。
- 响应式和无刘海模式。

## 12. 待决策问题

| 问题 | 选项 | 建议 |
| --- | --- | --- |
| 首个 MVP 技术栈 | SwiftUI/AppKit 或 Tauri | 如果要快，先 Tauri spike；如果要正式质感，直接 SwiftUI |
| 首个接入 CLI | Claude / Codex / Qwen | 选最容易产生结构化事件的工具 |
| 事件协议 | stdout marker / socket / localhost API | MVP 用 localhost 或 Unix socket JSON |
| 风险拦截位置 | CLI 执行前 / UI 提醒后 | 高风险必须执行前 |
| 是否进 App Store | 是 / 否 | 早决定，会影响 Tauri 透明窗口和私有 API 风险 |

## 13. 官方资料参考

- Tauri Process Model：https://v2.tauri.app/concept/process-model/
- Tauri Window customization and effects：https://v2.tauri.app/learn/window-customization/
- Electron Docs：https://www.electronjs.org/docs/latest/
- Apple SwiftUI MenuBarExtra：https://developer.apple.com/documentation/swiftui/menubarextra
- Apple AppKit NSPanel：https://developer.apple.com/documentation/appkit/nspanel
- Apple Human Interface Guidelines, Windows and panels：https://developer.apple.com/design/human-interface-guidelines/windows

