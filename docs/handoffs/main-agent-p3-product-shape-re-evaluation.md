# P3 Product Shape Re-evaluation Handoff

Date: 2026-06-09

## Goal

Re-evaluate the P3 packaging work against the actual Notch AI Monitor product shape, after the user pointed out that the Electron window/popover/overlay path still did not match the intended macOS notch tool.

This handoff intentionally does not claim that the product host is fixed. It records the correction: current Electron packaging is now explicitly labeled as `electron-spike`, and future product-shape work must start from the design and technical route documents.

## Product Facts Read

- `docs/technical-options-and-task-plan.md`: Notch AI Monitor manages local Claude/Codex/Qwen-style CLI agents. It is not a new AI agent. The technical spike route recommends Tauri + Web UI + mock Local Agent Manager; the formal MVP route recommends SwiftUI/AppKit Host + Local Agent Manager + shared event model. Electron is only the fastest demo route and is not the preferred product route.
- `docs/product-requirements-v2.md`: The app should default to hidden near the MacBook notch, then show lightweight capsules, expression state, and dropdown panels only when AI sessions need attention. Left capsule is session entry; right capsule is current event/action.
- `docs/效果说明.md`: The real notch size does not change. Capsules slide out from behind the notch. The expression lives in the right capsule. The core principle is hidden by default and only peeking out when needed.
- `docs/product-audit.md`: Existing prototypes cover fixed notch, left/right capsules, session entry, current event panel, and action expansion. Demo/debug controls must not leak into the formal experience.
- `design/notch-ai-monitor-hifi.html`, `design/notch-ai-monitor-hifi.css`, and the visual baseline screenshots under `output/high-fidelity-directions/`, `output/interactive-v2/`, and `output/product-audit-2026-06-06/`.

## Current Deviation

- The current Electron artifact has useful packaging value: it starts an app-managed Local Manager API, uses user-directory persistence, loads Desktop dist, and can be smoked from `.app`/`.dmg`.
- It is not the formal product host. Previous iterations as ordinary window, menu bar popover, and transparent top overlay all drifted from the intended product route.
- The naming `surface=overlay` and generic `package:mac`/`smoke:artifact` wording made the spike look like a product-shaped implementation. That was the main correction in this pass.

## Changes Made

- Added [AGENTS.md](/Users/zhaiyongtao/vibeCoding/notch-ai-monitor/AGENTS.md) with repo-local rules requiring product/design docs before UI or packaging shape changes.
- Added [scripts/design-surface-guard.mjs](/Users/zhaiyongtao/vibeCoding/notch-ai-monitor/scripts/design-surface-guard.mjs), exposed as `npm run guard:design`.
- Renamed Electron/Desktop surface integration from `overlay` to `electron-spike` in:
  - [apps/electron/src/main.ts](/Users/zhaiyongtao/vibeCoding/notch-ai-monitor/apps/electron/src/main.ts)
  - [apps/desktop/src/app/app-shell.ts](/Users/zhaiyongtao/vibeCoding/notch-ai-monitor/apps/desktop/src/app/app-shell.ts)
  - [apps/desktop/src/ui/styles/notch.css](/Users/zhaiyongtao/vibeCoding/notch-ai-monitor/apps/desktop/src/ui/styles/notch.css)
- Updated root package scripts so packaging/smoke routes are explicitly `electron-spike`:
  - `package:mac:electron-spike`
  - `smoke:packaging:electron-spike`
  - `smoke:artifact:electron-spike`
  - existing `package:mac`, `smoke:packaging`, and `smoke:artifact` remain compatibility aliases.
- Updated [docs/qa/p2-p3-beta-acceptance.md](/Users/zhaiyongtao/vibeCoding/notch-ai-monitor/docs/qa/p2-p3-beta-acceptance.md) to state that Electron `.app/.dmg` validates the beta packaging artifact, not the formal product host.
- Updated [docs/handoffs/main-agent-context-checkpoint-p2.md](/Users/zhaiyongtao/vibeCoding/notch-ai-monitor/docs/handoffs/main-agent-context-checkpoint-p2.md) section 33 with assessment, implementation, verification, and current runtime state.
- Follow-up safety correction: Electron spike UI is now disabled by default because the transparent overlay blocks clicks to other apps. Set `NOTCH_ELECTRON_SPIKE_UI=1` only for smoke/debug runs. Normal `.app` launch starts the app-managed Manager and tray fallback without creating the overlay.

## Guard Behavior

`npm run guard:design` now:

- Verifies the required product docs, hifi design, and visual baseline screenshots exist.
- Uses `git status --short -uall` so untracked UI/packaging files are not hidden behind collapsed directory entries.
- Requires the checkpoint to contain product-shape alignment markers when guarded paths are changed.
- Fails if Electron main injects misleading product surface names `surface=overlay` or `surface=menubar`.

The guard is a lightweight safety rail. It does not replace product judgment or visual QA.

## Verification

- `npm run guard:design` passed. It currently reports 35 guarded UI/packaging files in this untracked-heavy workspace.
- `npm run build:app -w @notch-ai-monitor/desktop` passed.
- `npm run build -w @notch-ai-monitor/electron-app` passed.
- `npm run package:mac:electron-spike` passed. It generated unsigned local artifacts:
  - `release/artifacts/Notch AI Monitor.app`
  - `release/artifacts/Notch-AI-Monitor-0.3.0-mac-arm64.dmg`
- `npm run smoke:packaging:electron-spike` passed with app-managed Manager URL `http://127.0.0.1:62389` and event `evt_real_codex_cli_error_20260609013443_0001`.
- `npm run smoke:artifact:electron-spike` passed from the DMG-mounted app with Manager URL `http://127.0.0.1:62547` and event `evt_real_codex_cli_error_20260609013523_0001`.
- `git diff --check` passed.
- Visual sanity screenshot:
  - `output/p3-product-shape-re-evaluation/electron-spike-artifact-sanity.png`

The screenshot is only evidence that the Electron spike artifact starts. It is not a formal product-shape acceptance screenshot.

After the click-blocking correction, repeat package/smoke verification is required before handing off a new artifact. The expected behavior is: normal `.app` launch should not show or block an overlay; smoke scripts opt into the spike UI with `NOTCH_ELECTRON_SPIKE_UI=1`.

Repeat verification after the correction:

- `npm run package:mac:electron-spike` passed.
- `npm run smoke:packaging:electron-spike` passed with Manager URL `http://127.0.0.1:65523` and event `evt_real_codex_cli_error_20260609020140_0001`.
- `npm run smoke:artifact:electron-spike` passed with DMG-mounted Manager URL `http://127.0.0.1:49338` and event `evt_real_codex_cli_error_20260609020232_0001`.
- Normal launch of `release/artifacts/Notch AI Monitor.app` left no visible/click-blocking overlay. The app log recorded `electron spike UI disabled by default`, with Manager URL `http://127.0.0.1:49397`.
- Screenshot: `output/p3-product-shape-re-evaluation/app-open-no-overlay-final.png`.

## Current Runtime State

- Long-running Local Manager API `http://127.0.0.1:4317` is not running at handoff time.
- Desktop Vite `http://127.0.0.1:5174` is running, PID `94874`.
- No packaged `Notch AI Monitor.app` or app-managed Manager process was left running after verification.

## Open Decisions

- Formal product host route is still undecided. The next step should be an ADR comparing:
  - Tauri spike route: fastest closer-to-native host while preserving Web UI velocity.
  - SwiftUI/AppKit route: formal MVP host route recommended by the technical plan.
- Electron should not receive further product-shape polish unless the user explicitly chooses it as a demo-only beta artifact.
- Icon metadata still has a packaging warning because the current packager looks for an icon format it skips. This is artifact polish, not product-shape work.
- Signed/notarized distribution still requires Developer ID identity and notary credentials. Local testing does not require a certificate.

## Next Agent Instructions

- Do not continue from the Electron overlay/popover path as if it were the product direction.
- Before any UI/packaging/product-shape edit, read the product docs and run `npm run guard:design`.
- Protect existing P2/P3 infrastructure: Local Manager API, read-only Desktop Manager client, real CLI adapter, event history, pending action lifecycle, and app-managed Manager smoke should remain reusable.
- If implementing the real product host, start with a short ADR and prototype plan before changing UI code.
