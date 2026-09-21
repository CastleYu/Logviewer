# Agent 交互页面验收

本次完善现有 AI 工作区，协议基线为 OpenCode **v1.2.27**。

## 已实现

- 请求提交立即反馈，显示工作耗时、执行工具、等待权限/问题、重试及上下文压缩；不会把 204 接收当成任务完成。
- 使用 Streamdown + Shiki 插件渲染流式 Markdown、GFM 表格和代码，支持中文复制/下载控件。渲染模块按需加载，原始用户日志按纯文本显示。
- 回复整体、长输入、推理、工具输入/输出/错误、文件、子任务、步骤、补丁、快照、重试和压缩记录可折叠；未知片段保留原始详情。消息元数据可展开，用户向上阅读时保持位置，可回到底部。
- 服务端保存 FIFO 队列，支持移除、Stop 暂停保留、显式继续。失败发送保留队列项；异步错误后可取回本轮输入。按会话串行化发送/停止操作，避免迟到的请求或轮询复活已停止任务。
- SSE 捕获异步 session.error，并由轮询补偿消息、状态及权限/问题。断流警告与业务错误分开。自动压缩 summary 和 tool-calls 中间步骤不会提前触发下一条队列。
- CLI 恢复按钮从对应目录启动可见 cmd，通过 attach 的 session 参数访问同一后端会话。认证只通过子进程环境传递。标准 npm opencode.cmd 解析到实际 exe，避免特殊目录参数被二次解析。

## 验证结果

| 验证 | 结果与证据边界 |
| --- | --- |
| npm run lint | 通过 |
| npm run build | 通过；仍有非阻断的大 chunk 提示，Markdown 已独立按需加载 |
| npm run verify:ai | 通过：现有会话、权限/问题、停止、持久化和工作目录回归 |
| npm run verify:ai-runtime | 通过：已有连接优先、托管启动、认证及退出清理 |
| npm run verify:ai-flow | 通过：FIFO、Stop、恢复/移除、500 保留输入、summary/tool-calls 中间状态、SSE 错误/断流、持久化重建、空历史和慢 admission/abort 竞争 |
| npm run verify:ai-recovery | 通过：正常停止刷新、空队列恢复不再被历史停止错误暂停、重启后的工具中间步骤、CLI 忙碌时网页排队 |
| npm run verify:ai-routes | 通过：真实 HTTP 路由、队列/Stop/继续、错误 JSON、CLI 鉴权环境/目录/会话参数传递、既有会话认证绑定 |
| npm run verify:opencode-live | 通过：真实 OpenCode 1.2.27；新增 LogViewer HTTP API→AiService→OpenCode→本地模型 fixture→消息/状态回传，连续两条 prompt 顺序完成；另测错误密码 401。不代表真实模型推理质量 |
| npm run verify:ai-terminal | 通过：真实 Windows cmd、标准 npm shim 与 exe、含中文/空格/&/% 的 cwd 和参数；只清理测试创建的进程 |
| 浏览器实际操作 | 通过：表格/代码和代码复制、运行中连续排队、Stop 暂停、移除/继续、权限与问题回传、compact 后继续、错误回显及取回输入 |
| 显示验收 | 浅/深主题，1100×900 与 390×844；390px 页面没有横向溢出，长代码只在内部滚动；最终实例没有控制台错误 |

浏览器使用独立临时存储和 OpenCode fixture，未改用户已有会话、日志、模型配置。开发验收脚本：`npm run acceptance:agent`，启动后输出本机回环地址。

## 兼容边界

- [v1.2.27 attach 源码](https://github.com/anomalyco/opencode/blob/v1.2.27/packages/opencode/src/cli/cmd/tui/attach.ts)固定使用 `opencode` 用户名；使用自定义用户名的实例在页面明确报错，不会伪报 CLI 恢复成功。
- 未识别的 cmd/bat 包装器遇到包含 shell 元字符的参数，会提示配置底层 opencode.exe。标准 npm 包装器及直接 exe 已做实际参数验证。
- 原生 OpenCode TUI 的视觉及交互未验收；本次验证到真实 Windows 启动器、精确目录/参数以及真实 OpenCode HTTP 协议。
- SSE 没有可重放游标，断流期间由消息/状态补偿；未持久化到消息的瞬时事件无法保证回放。未知新版片段保留详情，但没有声称兼容未测试的 OpenCode v2 协议。
- 应用若在请求 admission 期间关闭，恢复后暂停待发送队列，先检查会话再继续，避免自动重复提交。

研究参考和选择理由见 [方案](agent-conversation-plan.md)：[Streamdown](https://streamdown.ai/docs/usage)、[AI Elements Tool](https://ai-sdk.dev/elements/components/tool)、[assistant-ui](https://www.assistant-ui.com/docs/guides/chain-of-thought)。

## 中断后复核（2026-09-21）

本轮重新检查实际文件、API 接线和状态转换，没有仅沿用上一轮的“通过”结论。发现并修复：

1. 正常 Stop 的 `MessageAbortedError` 在刷新时被误判为失败；现在会话状态及消息内容均显示已停止。显式继续后，已确认的历史错误不会再次暂停队列。
2. 重启恢复的轮询可能把 `tool-calls` 中间消息视为结束；现在继续等待最终回复。
3. CLI 正在处理同一会话时，网页只看本地状态可能提前提交；现在出队前核对真实远端状态。
4. 新会话创建阶段缺少取消入口；现在可取消，迟到的创建结果不会继续发送 prompt。原输入保留。
5. 迟到的 prompt 响应可能覆盖已停止的界面状态；现在每次提交都带取消标记，并按当前会话定位 Stop。
6. 暂停队列清空后没有继续按钮；现在空队列也能显式恢复。提交期间的新外部请求会保留在输入框，不会静默丢弃或跨日志自动发送。
7. 终端测试曾通过全局 cmd PID 差集猜测自身进程；现在仅记录注入 spawn 实际返回的子进程 PID，并只清理这些进程。

复核新增的三个页面场景已真实操作通过：创建中取消后会话无消息且原输入保留；慢提交 Stop 后保持已停止；空暂停队列可继续。HTTP/恢复/真实 OpenCode 服务链测试、现有 AI 回归、Windows 启动器、类型检查及构建均重新通过。原生 TUI 视觉/交互边界仍按上文记录，不将启动器 fixture 冒充真实 TUI 验收。
