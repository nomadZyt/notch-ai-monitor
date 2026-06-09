# QA Agent P0 Handoff

日期：2026-06-06  
Agent：QA Agent  
阶段：P0 技术 Spike  
工作目录：`/Users/zhaiyongtao/vibeCoding/notch-ai-monitor`

## 1. 本次目标

- 将主 agent 手工验收过的 P0 UI/manager/risk 链路固化成可重复 QA checklist。
- 新增最小浏览器 e2e smoke，覆盖 desktop app 的 P0 用户路径和 390px/760px responsive metrics。
- 保持普通 `npm test` 轻量，不要求本地浏览器或 Vite dev server。
- 不修改业务实现；只接入 QA 测试、文档和脚本。

## 2. 已完成内容

- 新增 `docs/qa/p0-acceptance.md`，列出 P0 acceptance checklist、覆盖方式、artifacts 和当前缺口。
- 新增 Playwright QA 配置，`npm run test:qa` 会启动或复用 `http://127.0.0.1:5174/` 的 desktop Vite server。
- 新增 P0 browser smoke，覆盖初始 all-events risk peek、右胶囊 action panel、risk reject 后切 confirm、ArrowLeft/ArrowRight 分页、error terminate 二次确认、idle toast 不开 panel。
- 新增 390px/760px responsive metrics：断言无横向溢出，right capsule、action panel、action buttons 均在 viewport 内。
- 生成 responsive 截图与 metrics 到 `tests/artifacts/qa-p0/`，未写入 `apps/desktop/dist`。

## 3. 修改/新增文件

| 文件 | 类型 | 说明 |
| --- | --- | --- |
| `package.json` | 修改 | 新增 `test:qa` script，保留原 `test` 轻量链路 |
| `package-lock.json` | 修改 | 新增 `@playwright/test` 轻量 e2e 依赖 |
| `apps/desktop/tests/playwright.config.mjs` | 新增 | Playwright 配置、本地 Vite webServer、artifact output |
| `apps/desktop/tests/e2e/p0-smoke.spec.mjs` | 新增 | P0 desktop browser smoke/e2e |
| `docs/qa/p0-acceptance.md` | 新增 | P0 QA 验收文档 |
| `docs/handoffs/qa-agent-p0.md` | 新增 | 本 handoff |
| `tests/artifacts/qa-p0/p0-responsive-390.png` | 新增 | 390px responsive 截图 |
| `tests/artifacts/qa-p0/p0-responsive-760.png` | 新增 | 760px responsive 截图 |
| `tests/artifacts/qa-p0/responsive-metrics.json` | 新增 | responsive bounding box 和 overflow metrics |

## 4. 关键决策

- 选择 Playwright 而不是只做 Node smoke，因为任务要求至少覆盖 P0 UI 浏览器路径；配置保持单 worker、Chromium、无视频，只保留 failure trace 和 responsive 截图。
- `npm test` 不接浏览器，避免本地开发变重；浏览器测试单独放在 `npm run test:qa`。
- e2e 主要断言 DOM state、action ids、live region 和 bounding box，减少对视觉文案和截图肉眼判断的依赖。
- `risky confirm command -> risk event` 复用 manager test layer 覆盖；P0 当前没有真实 CLI/transport 注入 UI 的入口，不额外改 UI 源码。

## 5. 暴露的接口或数据结构

- 根脚本：`npm run test:qa`
- Playwright config：`apps/desktop/tests/playwright.config.mjs`
- Browser smoke spec：`apps/desktop/tests/e2e/p0-smoke.spec.mjs`
- QA artifacts：`tests/artifacts/qa-p0/`

## 6. 测试结果

- 执行命令：`npm install --save-dev @playwright/test`
- 结果：安装成功；npm audit 仍提示 2 个 moderate vulnerability，未跑 `npm audit fix --force`。
- 执行命令：`npm test`
- 结果：通过；shared 9/9、local-manager-mock 8/8、risk-policy 6/6。
- 第一次执行命令：`npm run test:qa`
- 结果：失败于 Playwright Chromium runner 未安装，未进入应用逻辑。
- 执行命令：`npx playwright install chromium`
- 结果：Chromium runner 下载到用户 Playwright cache。
- 第二次执行命令：`npm run test:qa`
- 结果：通过；Playwright 4/4。

## 7. 未解决问题

- 当前 QA 是 smoke/e2e，不包含截图 baseline diff 或像素级视觉回归。
- 仍未覆盖 Tauri IPC、真实 CLI adapter、真实副作用、真实终端定位。
- Playwright 首次运行前需要安装 Chromium runner；这一步不会由普通 `npm test` 自动触发。

## 8. 下一位 agent 需要知道的上下文

- `npm run test:qa` 会复用已有 `http://127.0.0.1:5174/` server；如果没有现成 server，会通过 Playwright webServer 启动 Vite 并在测试结束后清理该进程。
- Responsive metrics 当前证据：390px 和 760px 下 `scrollWidth` 等于 viewport width，right capsule、action panel、action buttons 都在 viewport 内。
- 如果后续加入真实 manager transport，可以补 UI 层的 risky confirm 注入 e2e；当前 P0 已在 manager test layer 覆盖。

## 9. 注意事项

- 不要回滚其他 agent 或用户已有改动。
- 如果需要修改非自己 ownership 文件，先在 handoff 中写明原因。
- P0 只做技术 Spike，不扩展到完整产品实现。
- 本轮未修改 `packages/shared`、`packages/local-manager-mock`、`packages/risk-policy` 或 `apps/desktop/src` 业务源码。
