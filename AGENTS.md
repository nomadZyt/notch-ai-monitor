# Notch AI Monitor Agent Rules

- 在 codex 生成内容期间，不要只告诉结果，也要简短说明怎么做。
- 修改产品形态、Desktop UI、Electron/Tauri/SwiftUI packaging 或 visual QA 前，必须先读：
  - `docs/technical-options-and-task-plan.md`
  - `docs/product-requirements-v2.md`
  - `docs/效果说明.md`
  - `docs/product-audit.md`
  - `design/notch-ai-monitor-hifi.html`
  - `output/high-fidelity-directions/01-quiet-glass.png`
  - `output/interactive-v2/22-desktop-face-uncovered.png`
  - `output/interactive-v2/14-left-chip-sessions-panel.png`
  - `output/product-audit-2026-06-06/04-action-expanded.png`
  - `output/product-audit-2026-06-06/05-sessions-expanded.png`
- 当前先实现 Tauri Web UI MVP host；SwiftUI/AppKit 仍是 formal host 候选/后续路线。
- Electron active code 已清理；不要恢复 Electron 作为产品宿主、packaging spike 或默认 `.app` 路线。
- Desktop UI 只消费 Manager snapshot/read-only endpoints，不直接操作 CLI 进程、不读取 persistence file、不读取 control token。
- 不新增真实 retry/terminate side effect；terminate 只能 graceful stop；不得按 PID 操作产品进程。
- 修改前后都更新 `docs/handoffs/main-agent-context-checkpoint-p2.md`，说明读过的产品事实、偏差、修改范围和验证结果。
- 使用 `apply_patch` 编辑文件；不要 reset/checkout/revert 用户或其他 agent 的改动。
