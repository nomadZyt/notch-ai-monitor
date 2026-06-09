# Risk Agent P0 Handoff

日期：2026-06-06  
Agent：Risk Agent  
阶段：P0 技术 Spike  
工作目录：`/Users/zhaiyongtao/vibeCoding/notch-ai-monitor`

## 1. 本次目标

- 创建独立 `packages/risk-policy` TypeScript workspace 包，依赖 `@notch-ai-monitor/shared`。
- 实现 P0 RiskScanner 纯函数 API，用于扫描命令风险、生成 Evidence、必要时构造 risk event。
- 覆盖 `rm -rf` / `rm -fr`、`git clean -fd` / `git clean -xdf`、`sudo`，并补充 `chmod -R 777`、`curl | sh`、`dd of=` 等轻量规则。
- 添加聚焦单测，验证 safe command、rm、git clean、sudo、组合命令和 Evidence/Event 转换。
- 不修改 UI、desktop 源码、shared 源码或 local-manager-mock 源码。

## 2. 已完成内容

- 新增 `@notch-ai-monitor/risk-policy` 包，使用 strict TypeScript + Node test runner。
- 实现 `scanCommand(command, context?)`，返回 `RiskAssessment`，包含 `riskLevel`、`isRisky`、`reasons`、`affectedPaths`、`impact`、`rollback`、`origin`、`matchedRules`。
- 实现 `commandLooksRisky(command, context?)`，作为轻量 boolean 判断。
- 实现 `riskAssessmentToEvidence(assessment)`，输出符合 shared `Evidence` 契约的证据对象。
- 实现 `buildRiskEvent(input)`，对非 low risk 命令返回完整 `NotchEvent`，`type: "risk"`，包含默认 risk actions。
- 根 `package.json` 已接入 risk-policy build/test，保留 shared、manager、desktop 原有构建链路。
- `package-lock.json` 已刷新 workspace link。

## 3. 修改/新增文件

| 文件 | 类型 | 说明 |
| --- | --- | --- |
| `packages/risk-policy/package.json` | 新增 | risk-policy package metadata、exports、scripts、shared dependency |
| `packages/risk-policy/tsconfig.json` | 新增 | strict TypeScript 编译配置 |
| `packages/risk-policy/src/index.ts` | 新增 | RiskScanner API、P0 规则、Evidence/Event 转换 |
| `packages/risk-policy/tests/risk-scanner.test.mjs` | 新增 | Node test runner 单测 |
| `package.json` | 修改 | 根 build/test 串联 risk-policy |
| `package-lock.json` | 修改 | 新增 risk-policy workspace package/link |
| `docs/handoffs/risk-agent-p0.md` | 新增 | 本 handoff |

## 4. 关键决策

- Scanner 保持纯函数和轻量规则，不实现完整 shell parser、命令执行、拦截、权限控制或终端控制。
- `scanCommand` 先聚合规则命中，再按最高风险等级输出 assessment；组合命令会保留多条 reasons 和多个 `matchedRules`。
- `rm -rf` / `rm -fr` 对非临时目录判 high；命中 home/Documents、home/current/root 宽路径或 Documents wildcard 判 critical；临时目录删除仍判 medium，因为会跳过普通确认。
- `git clean -fd` / `git clean -xdf` 判 high；`-n` / `--dry-run` 不命中高风险规则。
- `sudo` 单独判 medium；和 destructive command 组合时由聚合后的最高等级体现 high/critical。
- `buildRiskEvent` 对 low risk 返回 `undefined`，对 medium/high/critical 返回 `NotchEvent`，方便 manager 只 ingest 真实风险事件。
- `createdAt` 在 `buildRiskEvent` 中是必填字段，避免 helper 内部读取当前时间，保持可测试和可复现。

## 5. 暴露的接口或数据结构

- `scanCommand(command, context?)`: 纯扫描 API。
- `commandLooksRisky(command, context?)`: boolean 风险判断。
- `riskAssessmentToEvidence(assessment)`: `RiskAssessment -> Evidence`。
- `buildRiskEvent(input)`: `BuildRiskEventInput -> NotchEvent | undefined`。
- `stableCommandHash(command)`: 与 manager mock 同风格的 FNV-1a command hash helper。
- Types:
  - `CommandRiskContext`
  - `RiskAssessment`
  - `BuildRiskEventInput`

## 6. 测试结果

- 执行命令：`npm run test -w @notch-ai-monitor/risk-policy`
- 结果：risk-policy 6 个测试全部通过。
- 执行命令：`npm test`
- 结果：shared 9 个测试、local-manager-mock 7 个测试、risk-policy 6 个测试全部通过。
- 执行命令：`npm run build`
- 结果：shared、risk-policy、local-manager-mock、desktop production build 全部通过。

## 7. 未解决问题

- 规则是 P0 Spike 级别，不是完整安全策略引擎；复杂 shell quoting、subshell、alias、函数、环境变量展开没有完整建模。
- `buildRiskEvent` 目前生成完整 `NotchEvent`；如果后续 manager 更偏好 ingest 宽松 event input，可以直接取 `scanCommand` + `riskAssessmentToEvidence` 后交给 manager normalization 补默认字段。
- `allow-once` action 仍保持 enabled 且 `requiresConfirm: true`，是否对 critical 风险禁用允许一次，需要产品/manager 后续明确。
- `risk-policy` 尚未接入 desktop 或 manager runtime，本轮只产出可测试包和转换 helper。

## 8. 下一位 agent 需要知道的上下文

- Manager 接入时建议流程：收到 command -> `scanCommand(command, { cwd, origin, source })` -> 如果 `commandLooksRisky` 或 `assessment.isRisky` 为 true，再 `buildRiskEvent({ command, sessionId, source, createdAt, assessment })` -> `ingestEvent(event)`。
- `buildRiskEvent` 返回的 event 已包含 `riskLevel`、`impact`、`rollback`、`affectedPaths` 和 risk actions；manager mock 仍会接受完整 event，不需要修改 shared contract。
- 如果 manager 想统一生成 `id` / `commandHash` / actions，也可以只使用 `riskAssessmentToEvidence(assessment)`，构造 `MockNotchEventInput` 后让 manager normalization 补字段。
- `git clean` 的 affected path 优先来自 `git -C <path>`，否则使用 context `cwd`，再否则为 `"."`。
- 所有 API 都不执行命令、不访问文件系统、不修改权限。

## 9. 注意事项

- 不要回滚其他 agent 或用户已有改动。
- 如果需要修改非自己 ownership 文件，先在 handoff 中写明原因。
- P0 只做技术 Spike，不扩展到完整产品实现。
- 当前工作区原本已有旧 `prototype/interactive.*` 删除状态和大量未跟踪 docs/design/output/prototype v2/package 文件；本次未回滚、未清理、未修改这些非本任务文件。
