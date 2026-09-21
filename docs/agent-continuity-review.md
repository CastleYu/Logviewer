# 中断后链路核对

| 用户需求 | 当前实现入口 | 验证 |
| --- | --- | --- |
| 工作中反馈 | AiWorkspace → AiActivity → AiSession.activity | 提交/取消、工具、权限/问题、重试、压缩状态；页面真实操作 |
| Markdown | AiConversation → Streamdown/code | 构建、浅深色/窄屏、表格/高亮/复制；来源见方案 |
| 工作流和折叠 | AiConversation Part/ToolBody/MessageError | 12 类 v1.2.27 part 与未知片段 fallback，正常停止与异常区分 |
| Queue/Stop/异常 | AiApi → aiRoutes → AiService → AiClient | verify:ai、ai-flow、ai-recovery、ai-routes；新增取消/空队列页面验收 |
| CLI 恢复 | terminal route → AiService.openTerminal → AiTerminal | HTTP 参数/认证注入测试 + 真实 Windows cwd/argv/shim 测试；原生 TUI 视觉未测 |
| OpenCode 流程 | AiClient SSE/status/messages → AiService 状态与队列 | 真实 v1.2.27 API 服务链、自动压缩/工具中间阶段 fixture、停止/恢复/共享 CLI 状态 |

验收主记录：[agent-conversation-acceptance.md](agent-conversation-acceptance.md)。本轮发现的缺口、修复和剩余兼容边界均列入该记录。

本次新加 `verify-ai-recovery.ts` 先复现了 `refresh must keep MessageAbortedError as a normal stop` 失败，再修复并验证通过。`verify-ai-routes.ts` 最初把全局配置变更误当作既有会话认证变更；测试修正为独立新会话验证，并增加既有会话绑定不变断言。
