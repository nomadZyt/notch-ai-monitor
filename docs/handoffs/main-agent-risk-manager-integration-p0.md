# Main Agent P0 Handoff: Risk Scanner Manager Integration

日期：2026-06-06  
Agent：Main Agent  
阶段：P0 技术 Spike  
工作目录：`/Users/zhaiyongtao/vibeCoding/notch-ai-monitor`

## 1. 本次目标

- Review Risk Agent 产出的独立 `@notch-ai-monitor/risk-policy` 包。
- 将 risk-policy 最小接入 `@notch-ai-monitor/local-manager-mock`，让 mock manager 可以把危险 `confirm` command 升级为 `risk` event。
- 保持 UI 和 shared 代码不变，验证完整 build/test。

## 2. 已完成内容

- 复查 `packages/risk-policy` 的规则、测试和 handoff。
- 在 `packages/local-manager-mock` 中新增对 `@notch-ai-monitor/risk-policy` 的依赖。
- 在 manager normalization 中加入升级规则：当 `ingestEvent(...)` 收到 `type: "confirm"` 且包含 command 时，先用 `buildRiskEvent(...)` 扫描；若命中风险规则，则返回并入队标准 `risk` event。
- 补充 manager 单测：危险 confirm command 会升级为 risk event，并产生 `angry/peek` view hints。

## 3. 修改/新增文件

| 文件 | 类型 | 说明 |
| --- | --- | --- |
| `packages/local-manager-mock/package.json` | 修改 | 新增 `@notch-ai-monitor/risk-policy` workspace dependency |
| `packages/local-manager-mock/src/mock-local-agent-manager.ts` | 修改 | confirm command 风险扫描和 risk event 升级 |
| `packages/local-manager-mock/tests/mock-local-agent-manager.test.mjs` | 修改 | 新增 risky confirm -> risk event 回归测试 |
| `package-lock.json` | 修改 | 刷新 workspace dependency link |
| `docs/handoffs/main-agent-risk-manager-integration-p0.md` | 新增 | 本 handoff |

## 4. 关键决策

- 只升级 `confirm` command，因为 P0 风险拦截目标是“AI 请求运行命令前”；`result` / `error` 中的 command 暂不改写为 risk。
- 继续让 manager 负责 ingestion 和 EventQueue 真值，UI 不知道 RiskScanner 的存在。
- 对安全命令，manager 保持原 confirm event normalization 行为。

## 5. 暴露的接口或数据结构

- 未新增外部 API。
- `MockLocalAgentManager.ingestEvent(event)` 现在具备隐式风险升级能力：
  - safe confirm command -> `confirm`
  - risky confirm command -> `risk`

## 6. 测试结果

- 执行命令：`npm run test -w @notch-ai-monitor/local-manager-mock`
- 结果：8 个 manager tests 全部通过。
- 执行命令：`npm run build && npm test`
- 结果：desktop build 通过；shared 9/9、local-manager-mock 8/8、risk-policy 6/6 全部通过。

## 7. 未解决问题

- `risk-policy` 仍是 P0 规则扫描，不是完整 shell 安全引擎。
- 真实 CLI adapter 接入时，需要决定是传 confirm command 给 manager 自动升级，还是 adapter 侧先调用 risk-policy。
- critical 风险是否禁用 `allow-once` 尚未产品化决定；当前仍允许二次确认。

## 8. 下一位 agent 需要知道的上下文

- UI 无需改动，仍只消费 manager snapshot 和 action result。
- QA 需要新增一个用例：注入 `type: "confirm"` 的 `rm -rf` command，应在 UI 中看到 risk capsule 和 risk panel。
- Manager 后续如果加入真实 transport，命令上报路径应复用 `ingestEvent(...)` 以保留自动风险升级。

## 9. 注意事项

- 不要回滚其他 agent 或用户已有改动。
- P0 仍不执行真实命令、不做真实终端控制、不做真实危险副作用。
