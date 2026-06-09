# Notch AI Monitor P2 View Log Contract

日期：2026-06-08  
阶段：P2.1

## 1. 目标

`view-log` 是 P2 第一条真实 action side effect 合同，但它必须保持 read-only：

- 不 resolve event。
- 不控制 CLI 进程。
- 不执行 `retry` / `terminate`。
- 不让 Desktop 直接读取或打开本地文件。
- Manager 负责选择并返回可审计日志目标。

## 2. 使用现有协议

P2.1 不扩展 shared model、API endpoint 或 protocol envelope。

沿用现有 `ActionResultPayload.effects[]`：

```ts
effects?: Array<{
  type: SideEffect;
  target?: string;
  mocked: boolean;
}>;
```

## 3. Action Result 语义

`view-log` 成功处理后仍返回：

- `status: "noop"`
- `nextEventId` 指向当前 active event
- event status 保持 `active`

这表示用户只是查看上下文，尚未处理或忽略错误。

## 4. 安全日志目标选择

Manager 按顺序选择目标：

1. 从 `event.evidence.affectedPaths` 中选择第一条安全日志路径。
2. 如果没有安全路径，但有 `event.evidence.logExcerpt`，回退为展示日志摘录。
3. 如果两者都没有，返回 no-op feedback，事件仍保持 active。

安全路径规则：

- 必须是非空字符串。
- 不允许 URL。
- 不允许 NUL、换行符。
- 不允许 `..` 路径段。
- 不允许 `~` 开头。
- 文件名必须看起来像日志目标：
  - 扩展名为 `.log`、`.txt`、`.out`、`.err`
  - 或文件名为 `stdout`、`stderr`、`output`

## 5. Effects

安全日志路径命中时：

```json
{
  "type": "filesystem",
  "target": "/Users/example/project/logs/error.log",
  "mocked": false
}
```

含义：

- Manager 已选择并返回一个通过安全校验的 read-only filesystem target。
- Desktop 可以展示该 target。
- Desktop 仍不得直接读取、打开或修改该 target。

只有日志摘录时：

```json
{
  "type": "navigation",
  "target": "event:<eventId>#logExcerpt",
  "mocked": true
}
```

含义：

- 没有安全文件路径。
- UI 只能展示当前事件详情里的 `logExcerpt`。

## 6. P2.1 不做的事

- 不新增日志文件读取 endpoint。
- 不调用 macOS `open`。
- 不打开 Terminal 或 attach PTY。
- 不 kill / restart / retry 任何真实进程。
- 不扩展 `Evidence` 增加 `logPath` 字段；如 P2.4 real adapter hardening 证明需要，再单独设计模型扩展。
