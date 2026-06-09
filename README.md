# Notch AI Monitor

Notch AI Monitor is a local macOS companion surface for monitoring AI CLI sessions near the MacBook notch. The current active host is the Tauri Web UI MVP: Tauri owns the small top-of-screen app window and app-managed Local Manager API lifecycle, while the Desktop Web UI only consumes Manager snapshot/read-only endpoints.

Electron active code has been removed. Do not restore Electron as the product host, packaging spike, or default `.app` route.

## Current Entry Points

- Product and technical index: [docs/README.md](docs/README.md)
- Current checkpoint: [docs/handoffs/main-agent-context-checkpoint-p2.md](docs/handoffs/main-agent-context-checkpoint-p2.md)
- Current Tauri handoff: [docs/handoffs/main-agent-p3-tauri-mvp-host.md](docs/handoffs/main-agent-p3-tauri-mvp-host.md)
- Beta acceptance checklist: [docs/qa/p2-p3-beta-acceptance.md](docs/qa/p2-p3-beta-acceptance.md)
- Agent rules: [AGENTS.md](AGENTS.md)

## Useful Commands

```sh
npm run guard:design
npm run dev:tauri
npm run build:tauri-mvp
npm run smoke:real-link
npm run test:qa:real-link
npm run test:qa
npm run build
```

`npm run package:mac` currently points to `npm run build:tauri-mvp`.

## Project Layout

- `apps/desktop`: Web UI surface and Browser QA.
- `apps/tauri`: current macOS Tauri MVP host.
- `packages/local-manager-api`: localhost Manager API.
- `packages/local-manager-mock`: Manager runtime/state/action projection core.
- `packages/cli-adapter-real`: real CLI wrapper/notch-run adapter.
- `docs/contracts`: active runtime/API/action contracts.
- `docs/handoffs`: checkpoint and historical implementation handoffs.
- `design`, `output`, `prototype`: design sources, visual baselines, and historical prototypes.
