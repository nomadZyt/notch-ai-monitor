# Main Agent Handoff: P1+.5 Quiet Preference Persistence

日期：2026-06-08  
Agent：Main Agent  
阶段：P1+.5

## 本次目标

继续 P1+ polish，利用现有 Session Hub footer 的 `静音普通运行` / `偏好` 入口，完成一个不触碰业务链路的本地偏好持久化小闭环：

- 记录普通运行静音偏好。
- reload 后保留偏好状态。
- 提供清晰的按钮状态、toast 和 ARIA 语义。

本轮只改 Desktop 本地 UI preference，不修改 shared model、API、protocol、EventQueue/StateMachine、Manager action 合同或 real CLI adapter。

## 已完成内容

- 新增 Desktop 本地偏好：
  - localStorage key：`notch-ai-monitor:desktop-preferences:v1`
  - 字段：`quietNormalRuns: boolean`
  - 默认值：`false`
- `静音普通运行` 按钮改为 toggle：
  - 关闭状态：`静音普通运行`，`aria-pressed=false`
  - 开启状态：`恢复普通提醒`，`aria-pressed=true`
  - 开启 toast：`普通运行提醒已静音`
  - 关闭 toast：`普通运行提醒已恢复`
- `偏好` 按钮现在反馈当前状态：
  - `偏好：普通运行已静音`
  - `偏好：普通运行会提醒`
- `#desktop` 增加展示/测试用 `data-quiet-normal-runs`。
- 增加 footer toggle active 样式。
- 更新 Desktop QA，覆盖点击、reload 持久化、偏好 toast、恢复默认。

## 修改/新增文件

- 修改 `apps/desktop/src/app/app-shell.ts`
- 修改 `apps/desktop/src/ui/styles/notch.css`
- 修改 `apps/desktop/tests/e2e/p0-smoke.spec.mjs`
- 修改 `docs/handoffs/main-agent-context-checkpoint-p1.md`
- 新增 `docs/handoffs/main-agent-quiet-preference-persistence-p1plus.md`

## 关键决策

- 只持久化 UI preference，不让它改变 event 入队、EventQueue priority、Manager snapshot 或真实通知策略。
- localStorage 读写是 best-effort；不可用或 JSON 损坏时回落默认值。
- 使用 `aria-pressed` 表达二态按钮语义，避免只靠文案/颜色表达状态。
- 不接入真实 `view-log` / `retry` / `terminate` side effect。

## 暴露的接口或数据结构

没有新增 API、protocol、模型字段或持久化字段。

新增 Desktop 本地存储结构：

```json
{
  "quietNormalRuns": true
}
```

该结构仅属于浏览器 localStorage，不属于 Manager API contract。

## 测试结果

通过：

- `npm run build:app -w @notch-ai-monitor/desktop`
- `npm run test:qa`（10/10）
- `curl http://127.0.0.1:4317/health`
- `curl http://127.0.0.1:4317/v1/snapshot`
- in-app browser API mode 验证：
  - `data-state=dormant`
  - `data-mood=none`
  - `eventCount=0`
  - `alertTitle=全部安静`
  - `sessionHubTitle=0 个会话`
  - browser console error：0
- in-app browser mock preference 验证：
  - 默认 `quietNormalRuns=false`
  - 点击后 `quietNormalRuns=true`，按钮显示 `恢复普通提醒`，`aria-pressed=true`
  - `偏好` toast 显示 `偏好：普通运行已静音`
  - reload 后仍为 `quietNormalRuns=true`
  - 再次点击恢复 `quietNormalRuns=false`
  - browser console error：0

当前服务已重启并仍在：

- Local Manager API：`http://127.0.0.1:4317`，PID `16864`
- Desktop Vite：`http://127.0.0.1:5174`，PID `17975`

当前 API snapshot 因服务重启为空：

- `sessions=0`
- `activeSessions=0`
- `activeEvents=0`
- `currentEventId=null`

## 未解决问题

- `quietNormalRuns` 目前只是本地 UI preference，尚未影响 event 过滤、入队或通知策略。
- Session Hub 暂无 “查看事件” 或 “Attach/打开终端” 操作。
- 左侧 tool stack 仍是静态图标，未按实际 session tools 动态裁剪。
- `view-log` / `retry` / `terminate` 的真实 side effect 仍未实现。
- `AGENTS.md` 文件在工作目录下未找到；本轮按用户消息中提供的 AGENTS 指令执行。

## 下一位 agent 需要知道的上下文

- P1+.5 是本地 UI preference 持久化，不是业务策略接入。
- 如果继续 P1+，建议做可访问性回归，尤其是 panel/dialog semantics、toggle focus/keyboard、live region 文案稳定性。
- 如果进入 P2.1，仍应先设计真实 `view-log` 的安全文件打开合同，再考虑 `retry` / `terminate` 的真实进程 side effects。
