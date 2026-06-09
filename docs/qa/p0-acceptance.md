# Notch AI Monitor P0 QA Acceptance

日期：2026-06-06  
阶段：P0 技术 Spike  
范围：把主 agent 已手工验收的 P0 链路固化为可重复 QA checklist、Node smoke 和浏览器 e2e。

## 1. QA 方法

- 保留根 `npm test` 为轻量测试，只跑 shared、local-manager-mock、risk-policy，不依赖浏览器或本地 dev server。
- 新增 `npm run test:qa` 跑 Playwright browser smoke。Playwright 会启动或复用 `http://127.0.0.1:5174/` 的 desktop Vite server。
- 响应式验收不只依赖截图：测试会采集 DOM metrics，断言 `scrollWidth <= viewport width`，并检查 right capsule、action panel、action buttons 的 bounding box 是否在 viewport 内。
- Playwright 截图与 metrics 输出到 `tests/artifacts/qa-p0/`，不写入 `apps/desktop/dist`。

首次运行 Playwright 如提示缺浏览器，需要执行：

```sh
npx playwright install chromium
```

## 2. Acceptance Checklist

| 验收项 | 状态 | 自动化覆盖 | 证据 |
| --- | --- | --- | --- |
| 初始 all scenario risk peek | 通过 | Playwright `loads the initial all-events risk peek and resolves risk to confirm` | 断言 `#desktop[data-state="peek"][data-mood="angry"]`、`#eventCount = 4`、`#alertTitle = 风险` |
| 右胶囊打开 action panel | 通过 | Playwright `openActionPanel(...)` helper，多条用例复用 | 断言 `data-state="expanded"`、`data-panel="action"`、`#actionPanel` visible |
| risk action resolve 后切到 confirm | 通过 | Playwright 第 1 条用例 | 点击 `data-action="reject"` 后断言 `data-mood="waiting"`、`#eventCount = 3`、`#eventKind = Confirm`、`#pagerText = 1 / 3` |
| ArrowLeft/ArrowRight 分页 | 通过 | Playwright `pages active events with ArrowLeft and ArrowRight` | `risk -> confirm -> error -> confirm`，断言 title/kind/pager |
| error terminate 二次确认 | 通过 | Playwright `requires a second confirmation...` | 第一次点击 `terminate` 后按钮变为 `确认 终止旧服务`，第二次后 active event 归零 |
| idle 右胶囊 toast，不打开 panel | 通过 | Playwright `requires a second confirmation...` | idle 后点击右胶囊，断言 live region 为 `当前没有需要处理的事件` 且 `data-panel="none"` |
| 390px / 760px 无横向溢出、panel/capsule/action buttons 在 viewport 内 | 通过 | Playwright `keeps capsule, panel, and actions inside 390px and 760px viewports` | `tests/artifacts/qa-p0/responsive-metrics.json`、`p0-responsive-390.png`、`p0-responsive-760.png` |
| risky confirm command 自动升级为 risk event | 通过 | Node manager test layer | `packages/local-manager-mock/tests/mock-local-agent-manager.test.mjs` 的 `upgrades risky confirm command into a risk event`，由 `npm test` 覆盖 |

## 3. 自动化入口

```sh
npm test
npm run test:qa
```

当前通过结果：

- `npm test`：shared 9/9、local-manager-mock 8/8、risk-policy 6/6。
- `npm run test:qa`：Playwright 4/4。

## 4. Artifacts

- `tests/artifacts/qa-p0/p0-responsive-390.png`
- `tests/artifacts/qa-p0/p0-responsive-760.png`
- `tests/artifacts/qa-p0/responsive-metrics.json`
- `tests/artifacts/qa-p0/playwright-output/.last-run.json`

## 5. 当前缺口

- Playwright smoke 已覆盖 P0 浏览器路径，但没有做截图 baseline diff，因此它不是完整视觉回归测试。
- 当前仍是 Web/Vite shell，没有覆盖 Tauri IPC、真实 CLI adapter、真实命令执行或真实终端定位。
- `risky confirm -> risk` 按任务允许落在 manager test layer；UI 层没有新增真实 transport 注入入口。
