# AI 工作区 ACP 接入改造需求

> 由 [ui-button-spec.md](ui-button-spec.md) 拆出（H6 / 模块 M19）。基线 `main` @ 69ecfc8。
> 本次改造：AI 接入方式整体换成 **ACP（Agent Client Protocol）**，移除旧的 OpenCode HTTP 接入，使用 opencode 做端到端验收。

## 1. 澄清结论

| 问题 | 结论 |
|---|---|
| 接入范围 | 通用 ACP 客户端；opencode 是默认 Agent，也是唯一的验收对象 |
| 旧 HTTP 接入 | 完全移除；旧会话记录只读保留 |
| 必须保留的功能 | 历史会话恢复、消息排队、CLI 恢复、源码仓库绑定 + RCA 诊断 Agent |
| 日志如何交给 AI | 为 Agent 专门设计日志工具，按需读取，适配上下文小的模型 |
| 权限 | 读取直接放行；写入只能通过 LogViewer 提供的「文档 / 记忆」工具，不允许 Agent 直接写文件 |
| 验收模型 | OpenCode Go（`OPENCODE_GO_API_KEY`） |
| 面板形态 | 保持浮动窗口 |
| 结果联动 | 回答中的源行号和源码位置可点击 |

## 2. 已核实的 opencode ACP 能力（2026-11-12，opencode v2.2.7）

用 `opencode acp` 实测握手：
- 传输：子进程 stdio，JSON-RPC 2.0，每行一条消息。
- `initialize` 返回：`protocolVersion: 1`；`loadSession: true`；`sessionCapabilities` 包含 `list / resume / fork / close / delete / additionalDirectories`；`promptCapabilities` 支持 `embeddedContext`、`image`；`mcpCapabilities.http: true`（不支持 `sse`）；`_meta.steering.supported: true`。
- `session/new` 返回 `configOptions`，其中 `model` 是可选列表（当前默认 `opencode-go/deepseek-v4.1-flash`）。
- 连接后 Agent 会推送 `available_commands_update`（如 `/compact`、`/review`）。
- 认证方式：`opencode-login`（在终端运行 `opencode auth login`）。
- 本机路径：`opencode` 不在 Git Bash 的 PATH 里，位于 `D:\Code\data\opencode\bin\opencode.cmd`。

## 3. 架构

```
浏览器 AI 面板 ──HTTP/SSE──▶ LogViewer 服务端
                              ├─ AcpHost：拉起 Agent 子进程，stdio JSON-RPC
                              │     ◀── session/update、request_permission、fs/*
                              └─ LogTools MCP（HTTP，挂在本服务上）
                                    ◀── Agent 调用日志 / 文档 / 记忆工具
```

- 服务端新增 `AcpHost`（每个 Agent 配置对应一个子进程，多个会话复用同一个进程），替换 `aiClient`、`aiConnection`、`aiProtocol` 中的 HTTP 调用。
- 会话创建时通过 `session/new.mcpServers` 注入 LogTools MCP（`type: http`，地址带一次性令牌）。
- 客户端能力声明：`fs.readTextFile: true`、`fs.writeTextFile: false`、`terminal: false`。

## 4. 功能需求

### F1 Agent 配置
- 设置项只保留：Agent 名称、启动命令（默认 `opencode acp`，支持 `%VAR%` / `${VAR}` / `$env:VAR` 展开）、工作目录模式、环境变量白名单。
- 删除：实例 IP:端口、回退启动程序、用户名、密码环境变量名、Provider ID / Model ID 手填项。
- 「测试连接」：拉起进程并完成 `initialize`，显示 Agent 名称、版本和关键能力（可恢复会话、MCP HTTP）。
- Agent 要求认证时，显示认证方式和「在终端中登录」按钮（执行对应的登录命令）。

**验收**
- [x] 设置面板里没有旧的 HTTP 相关字段。
- [x] 点「测试连接」后显示 `OpenCode 2.2.7` 和能力列表。
- [x] 把启动命令改成不存在的程序，测试连接给出可读的错误（不是空白或 stack trace）。

### F2 会话
- 新建会话 → `session/new`；会话列表 → `session/list`（Agent 不支持时只用本地记录）。
- **历史会话恢复**：打开旧会话时调用 `session/load`，按 Agent 回放的 `session/update` 重建消息列表。
- 关闭面板不结束会话；关闭会话 → `session/close`；删除 → `session/delete`。
- 每个会话记录：Agent、`sessionId`、绑定的日志、工作目录、模型、创建时间。
- 旧 HTTP 会话：列表中标「旧版 · 只读」，可以查看消息，不能继续发送。

**验收**
- [x] 新建会话，发送一条消息，刷新页面后重新打开，历史消息完整。
- [x] 重启 LogViewer 服务后，旧会话仍能 `session/load` 恢复并继续对话。
- [ ] 旧版会话能查看、不能发送。

### F3 发送、流式输出与排队
- 发送 → `session/prompt`；`agent_message_chunk` / `agent_thought_chunk` 流式渲染，思考过程默认折叠。
- `tool_call` / `tool_call_update` 显示为工具卡片：名称、参数摘要、状态（等待 / 运行 / 完成 / 失败）、可展开结果。
- `plan` 显示为任务列表。
- **消息排队**：Agent 忙时新消息进入队列，显示在输入框上方，可删除、可调整顺序；当前轮结束后自动发送下一条。Agent 支持 steering 时，提供「插入到当前轮」选项。
- 停止 → `session/cancel`，当前轮显示「已停止」，队列暂停，需手动继续。
- 斜杠命令：输入 `/` 时按 `available_commands_update` 列出可用命令。

**验收**
- [x] 输入问题后 1 秒内开始出现流式文字。
- [x] 回答过程中再发两条消息，它们进入队列，之后按顺序自动发送。
- [ ] 点停止后 Agent 停止输出，队列暂停。
- [ ] 输入 `/` 出现 `/compact` 等命令。

### F4 日志工具（LogTools MCP）
专门为按需读取设计，每个工具的返回都有上限，适配上下文小的模型。

| 工具 | 参数 | 返回 |
|---|---|---|
| `log_overview` | — | 文件名、记录数、时间范围、级别分布、前 10 个模块、解析失败数（≤ 1 KB） |
| `log_search` | `query`、`regex?`、`level?`、`module?`、`from?`、`to?`、`limit≤50`、`cursor?` | 命中的源行号 + 单行摘要（每行截断 200 字），带 `nextCursor` |
| `log_read` | `line`、`before≤20`、`after≤50` | 指定源行附近的原文，超过 8 KB 截断并提示 |
| `log_record` | `line` | 单条记录的结构化字段和完整堆栈 |
| `log_stats` | `groupBy: level\|module\|thread\|minute`、`filter?` | 分组计数（最多 50 组） |
| `log_errors` | `limit≤30`、`cursor?` | ERROR / FATAL / 解析失败记录的摘要，按异常类型去重并计数 |
| `log_selection` | — | 用户在表格中当前选中的行（摘要） |
| `log_view` | — | 用户当前的筛选条件、搜索词和可见范围 |

- 所有返回都带「源行号」，并统一写作 `L1234`，方便界面识别成链接。
- 超出上限时返回 `truncated: true` 和继续读取的提示，不静默截断。
- 发送提问时**不再嵌入日志全文**：只附带简短上下文（文件名、当前选中行的行号范围、筛选摘要），引导 Agent 自己调用工具。
- 预置提示在会话的第一条消息里说明这些工具和 `L` 行号约定。

**验收**
- [x] 在 5 万行示例上问「最多的错误是什么」，Agent 通过 `log_errors` / `log_stats` 回答，不读全文。
- [x] 每次工具返回 ≤ 8 KB（服务端日志可查）。
- [x] 选中 3 行后问「这几行什么问题」，Agent 调用 `log_selection` 拿到这 3 行。
- [ ] 一次完整诊断的总输入 token 比旧版「嵌入选中行」方式下降，并记录数字。
- [ ] 使用上下文 32K 的模型也能完成一次诊断，不报超长。

### F5 文档 / 记忆工具（唯一的写入入口）
| 工具 | 作用 |
|---|---|
| `note_write` | 写入当前日志的调查笔记（Markdown），存到 LogViewer 数据目录，按日志归档 |
| `note_read` / `note_list` | 读取、列出笔记 |
| `memory_write` | 写入跨日志的长期记忆（如「此服务的超时阈值是 30s」），带标签 |
| `memory_search` | 按关键词 / 标签检索记忆 |
| `report_write` | 写入 RCA 报告，结构见 `logviewer-diagnose` Agent 约定 |

- 写入的内容在面板「笔记」标签页可以查看、编辑、删除和导出。
- 每次写入在对话中显示一张「已写入」卡片，可撤销。

**验收**
- [ ] Agent 写入的笔记出现在「笔记」标签页，刷新后仍在。
- [ ] 撤销后笔记被删除。
- [ ] 在新会话中，Agent 能通过 `memory_search` 检索到上一个会话写入的记忆。

### F6 权限
- `fs/read_text_file`：在工作目录（源码仓库）和日志快照目录内直接放行；目录外的读取拒绝并告诉 Agent 原因。
- `fs/write_text_file`：客户端不声明这个能力；即使收到请求也拒绝。
- `session/request_permission`：
  - 只读类工具（`kind` 为 read / search / fetch / think）自动选允许；
  - 编辑、删除、移动、执行类自动拒绝，回复里说明「请使用 note_write / report_write」；
  - 面板中显示被拒绝的请求，用户可以对单次请求手动放行。
- 规则写成可配置的策略表，默认值就是上面这套。

**验收**
- [x] 让 Agent「把结论写进 README」，它的直接写文件请求被拒绝，并改用 `note_write`。
- [ ] 让 Agent 读源码仓库中的文件，读取成功、没有弹窗。
- [ ] 让 Agent 读工作目录之外的路径，被拒绝，界面上能看到这条记录。

### F7 源码仓库绑定与 RCA 诊断 Agent
- 绑定仓库后：`session/new.cwd` = 仓库目录；日志快照目录通过 `additionalDirectories` 加入（Agent 不支持时作为只读 fs 根目录）。
- 保留现有的「源码工作区 / 隔离日志工作区」模式。
- RCA 诊断提示（`logviewer-diagnose`、`logviewer-evidence`）改为会话初始提示，同时可选安装到 `.opencode/agents/`。

**验收**
- [ ] 绑定仓库后问一个涉及源码的问题，Agent 读到了仓库里的文件。
- [ ] 隔离模式下 Agent 读不到仓库文件。

### F8 CLI 恢复
- 会话菜单中的「在终端继续」：打开终端，在会话工作目录执行 `opencode --session <sessionId>`（命令模板在 Agent 配置中可改）。
- 终端里继续对话后，回到面板点「刷新」，通过 `session/load` 同步新消息。

**验收**
- [ ] 点「在终端继续」，终端打开并进入同一个会话。
- [ ] 在终端问一个问题后回到面板刷新，能看到这轮对话。

### F9 回答联动
- 回答中的 `L1234`、`第 1234 行`、`源行 1234` 渲染成链接，点击后表格定位到该行并选中。
- `path/to/file.py:88` 这类源码位置渲染成链接，点击用当前选定的打开程序（H5）跳转。
- 工具卡片中的行号同样可点击。

**验收**
- [x] 点击回答中的 `L1234`，表格滚动到第 1234 行并选中。
- [ ] 点击 `foo.py:88`，用配置的 IDE 打开对应文件和行。

### F10 模型与模式
- 面板标题栏显示当前模型，点击是一个下拉，列出 `configOptions` 里的 `model` 选项。
- Agent 提供模式（mode）时，标题栏旁再显示模式下拉。

**验收**
- [ ] 模型下拉列出 opencode 返回的模型；切到另一个模型后，下一轮回答使用新模型。

## 5. 面板界面（浮动窗口，保留现有形态）

| 编号 | 现在 | 改为 |
|---|---|---|
| A1 | 关闭 | 保留；另加「最小化」 |
| A2 / A3 | 分析 ERROR / 分析全文（常驻顶部） | 只在对话为空时作为起始建议卡片显示：「概览这份日志」「分析错误」「分析选中的 N 行」「分析当前筛选结果」 |
| — | 「最近请求上下文」说明文字 | 改为输入框上方的上下文标签，例如 `📎 选中 3 行 · L30–L88 ×`，发送前可以移除 |
| A4 | 会话下拉 | 保留；列出本地会话和 `session/list` 的结果，旧版会话带「只读」标记 |
| A5 | 新会话 | 保留 |
| A6 | CLI 恢复 | 移到「⋯」菜单，改名「在终端继续」 |
| A7 | 设置 | 移到「⋯」菜单 |
| A8 / A9 | 输入框 / 发送 | 保留；忙时发送按钮变成「排队」，旁边出现「停止」 |
| 新增 | — | 标题栏：Agent 状态点（未连接 / 就绪 / 工作中 / 出错）、模型下拉；标签页「对话 / 笔记」 |

- 悬停提示使用统一的 `Tooltip` 组件（主文档 G-1）；深色配色使用主文档 H11 的 token；下拉通过 Portal 渲染（H10）。

## 6. 移除清单
- 服务端：`aiClient.ts`、`aiConnection.ts`、`aiProtocol.ts`、`managedServer.*` 中只为 HTTP 接入服务的部分；`aiRoutes.ts` 中的 `/launch`、`/catalogs` 等 HTTP 专用路由。
- 前端：`AiSettings` 中的地址、回退程序、用户名、密码、Provider / Model ID 字段。
- 配置：`AiConfig.endpoint`、`launch`、`username`、`passwordEnv`。读取旧配置时迁移启动命令，其余字段丢弃。

**验收**
- [x] 全仓搜索 `127.0.0.1:4096`、`passwordEnv`、`/session/` HTTP 调用，结果为 0。

## 7. 端到端验收（opencode + OpenCode Go）

环境：`opencode acp`，模型 `opencode-go/*`，密钥 `OPENCODE_GO_API_KEY` 只在进程环境中读取，不出现在日志和界面上。

新增脚本 `npm run verify:acp`，无界面执行以下流程，全部通过才算完成：
1. 拉起 `opencode acp`，`initialize` 成功，确认 `loadSession` 能力。
2. 加载 5 万行示例日志，新建会话（注入 LogTools MCP）。
3. 提问「概览这份日志并列出最主要的错误」，断言 Agent 至少调用了 `log_overview` 和 `log_errors`，回答中包含 `L` 行号。
4. 发送第二条消息时第一轮还没结束，断言它进入队列并在之后自动发送。
5. 让 Agent「把结论写进 README.md」，断言直接写文件被拒绝，`note_write` 被调用，笔记已落盘。
6. 结束进程，重新拉起，`session/load` 恢复会话，断言历史消息条数一致，并能继续对话。
7. 生成 CLI 恢复命令，断言它包含同一个 `sessionId`。
8. 输出本次的 token 用量和每次工具返回的大小。

界面验收（截图存入 `acceptance/`，命名 `acp-<场景>-<主题>.png`）：
- [ ] 空会话的起始建议卡片
- [ ] 流式回答 + 工具卡片 + 计划列表
- [ ] 排队中的消息
- [ ] 被拒绝的写入请求 + 已写入笔记的卡片
- [ ] 点击 `L1234` 后表格定位
- [ ] 深色和浅色各一套

## 8. 不在本次范围
- 除 opencode 以外的 Agent 验收（只保证协议层通用）。
- ACP 的 `terminal/*` 能力（不声明，Agent 不能直接执行命令）。
- 图片、音频输入。
