# Notch AI Monitor 原型审计截图索引

主文档：[docs/product-audit.md](../../docs/product-audit.md)

## 截图步骤

1. `01-dormant-idle.png`：休眠状态。健康度较好，屏幕占用极低。
2. `02-waiting-glance.png`：等待确认的一瞥状态。右侧提醒清楚，左侧普通运行胶囊会分散注意力。
3. `03-hover-peek.png`：尝试 hover 后截图。取证时仍停在 `glance`，说明 hover 入口需要复核。
4. `08-waiting-forced-peek.png`：等待确认的强制探出状态。目标视觉成立。
5. `04-action-expanded.png`：右侧操作面板展开。信息层级清楚，但动作语义不足。
6. `05-sessions-expanded.png`：左侧会话面板展开。列表可扫读，但管理动作仍是占位。
7. `06-risk-peek.png`：风险场景自动探出。高优先级信号有效，但缺少风险详情。
8. `09-narrow-waiting-glance.png`：窄视口一瞥。胶囊溢出。
9. `10-narrow-expanded-action.png`：窄视口展开。面板明显溢出。

## 证据限制

- 这次审计基于本地浏览器截图和静态原型代码。
- 未连接真实 CLI 进程、macOS 菜单栏或系统通知。
- 未做完整屏幕阅读器、键盘流和 WCAG 合规测试。
