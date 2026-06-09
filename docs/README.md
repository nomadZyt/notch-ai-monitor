# Notch AI Monitor Docs

This is the current documentation map. Prefer this file over older handoff titles when choosing what to read first.

## Current Facts

- Current active macOS host route: Tauri Web UI MVP.
- Formal SwiftUI/AppKit host remains a future candidate.
- Electron active code has been cleaned up and must not be restored as product host, packaging spike, or default `.app` route.
- Desktop UI only consumes Manager snapshot/read-only endpoints. It must not read persistence files, control tokens, or product CLI processes directly.
- `terminate` remains graceful stop only; do not introduce PID kill or force kill without a new contract.

## Read First

1. [handoffs/main-agent-context-checkpoint-p2.md](handoffs/main-agent-context-checkpoint-p2.md)
2. [qa/p2-p3-beta-acceptance.md](qa/p2-p3-beta-acceptance.md)
3. [handoffs/main-agent-p3-tauri-mvp-host.md](handoffs/main-agent-p3-tauri-mvp-host.md)
4. [technical-options-and-task-plan.md](technical-options-and-task-plan.md)
5. [product-requirements-v2.md](product-requirements-v2.md)
6. [效果说明.md](效果说明.md)
7. [product-audit.md](product-audit.md)

## Active Contracts

- [contracts/local-manager-api.md](contracts/local-manager-api.md)
- [contracts/real-cli-adapter.md](contracts/real-cli-adapter.md)
- [contracts/event-history-pending-actions-p2.md](contracts/event-history-pending-actions-p2.md)
- [contracts/internal-scheduler-sse-p2.md](contracts/internal-scheduler-sse-p2.md)
- [contracts/retry-terminate-p2.md](contracts/retry-terminate-p2.md)
- [contracts/view-log-p2.md](contracts/view-log-p2.md)
- [contracts/event-protocol.md](contracts/event-protocol.md)

## QA

- Current beta checklist: [qa/p2-p3-beta-acceptance.md](qa/p2-p3-beta-acceptance.md)
- Historical P0 checklist: [qa/p0-acceptance.md](qa/p0-acceptance.md)

## Handoffs

The handoff folder is append-heavy by design. Use [handoffs/README.md](handoffs/README.md) to choose the current handoff instead of scanning every historical file.

Standalone Electron P3 handoffs were deleted during documentation cleanup because their scripts, workspace, and artifacts no longer exist and the current route is Tauri MVP.
