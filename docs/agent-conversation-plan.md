# Agent 对话完善方案

范围：现有 AI 工作区、OpenCode v1.2.27 协议适配和 Windows CLI 恢复；保留日志阅读器的现有主题及独立/源码会话模式。

## 参考与选择

- [Streamdown](https://streamdown.ai/docs/usage)：流式 Markdown、未完成语法修复、GFM 与代码高亮/复制。直接使用其渲染器，不引入新的聊天后端。
- [AI Elements Tool](https://ai-sdk.dev/elements/components/tool)：工具名称、执行状态、输入/输出分层及可折叠详情。
- [assistant-ui grouped parts](https://www.assistant-ui.com/docs/guides/chain-of-thought)：推理与工具过程渐进披露，正文保持可读。
- [OpenCode v1.2.27](https://github.com/anomalyco/opencode/tree/v1.2.27)：以项目既定版本为协议基线，核对 message parts、session status、session.error、压缩摘要与 attach。

这些是可核查的成熟实现参考；不声称存在全网一致认可的唯一最佳方案，也不引入不兼容的 OpenCode v2 接口。

## 交互约定

1. 发送立即显示提交反馈，之后显示工作/工具/权限/问题/重试/压缩状态；保留输入直至后端接收。
2. 回复、推理、工具、长日志各有折叠层级；未知消息片段保留原始详情，禁止静默丢弃。
3. 忙碌时默认加入后端持久 FIFO 队列，可移除；Stop 停当前并暂停队列，错误同样暂停，由用户恢复。
4. SSE 用于异步错误，轮询补偿历史与状态；自动 compact 的摘要不能被当作任务最终回复。
5. CLI 按钮从会话目录打开可见 cmd，使用 OpenCode attach 的 session 参数恢复同一后端会话，认证只通过环境传递。

## 验收

运行 TypeScript、构建、既有 AI 测试与新增流程测试。用独立 fixture 验证真实页面的 Markdown、折叠、队列/Stop、错误、压缩、权限/问题、浅深主题和窄屏。分别记录协议模拟、真实 OpenCode 和原生 CLI 的验证边界，不把 fixture 当作真实模型分析。
