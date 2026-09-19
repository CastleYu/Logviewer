# Stage 02：OpenCode v1.2.27 企业内置 AI 研究

研究口径固定为 OpenCode `v1.2.27`，只采用该 tag 的官方仓库源码、release 和官方文档；没有把当前 `dev` API 当作兼容契约。

优先核验链接：

- [v1.2.27 tag/source tree](https://github.com/anomalyco/opencode/tree/v1.2.27)
- [v1.2.27 release notes](https://github.com/anomalyco/opencode/releases/tag/v1.2.27)（tag 存在，commit `4ee426b`）
- [session routes at v1.2.27](https://raw.githubusercontent.com/anomalyco/opencode/v1.2.27/packages/opencode/src/server/routes/session.ts)
- [server/auth and directory middleware](https://raw.githubusercontent.com/anomalyco/opencode/v1.2.27/packages/opencode/src/server/server.ts)
- [serve command](https://raw.githubusercontent.com/anomalyco/opencode/v1.2.27/packages/opencode/src/cli/cmd/serve.ts)
- [prompt schema/loop](https://raw.githubusercontent.com/anomalyco/opencode/v1.2.27/packages/opencode/src/session/prompt.ts)
- [permission routes](https://raw.githubusercontent.com/anomalyco/opencode/v1.2.27/packages/opencode/src/server/routes/permission.ts)
- [question routes](https://raw.githubusercontent.com/anomalyco/opencode/v1.2.27/packages/opencode/src/server/routes/question.ts)
- [official server guide](https://opencode.ai/docs/server/)

## 推荐边界

Logviewer 应作为企业内置的本地/内网客户端，启动一个独立的 `opencode serve` 进程，把“客户 fork 中已跟踪的源码”作为工作目录；诊断日志保存到独立的 standalone-log workspace。默认只读分析，写入/命令/外部目录均由 OpenCode permission 机制拦截。需要把 RCA 纳入 fork 时，提供显式、人工确认的 `git add` 操作，仅添加指定日志文件；不要让 Agent 自动提交、推送或把整个日志目录加入源码仓库。

这一边界同时解决两个问题：代码上下文来自客户 fork 的真实 tracked files，日志持久化又不会污染源码历史。OpenCode 的 session 数据、消息和工作目录状态由自身状态目录持久化，Logviewer 还应保存自己的会话索引、原始 API 响应和 RCA 文档；不能把 SSE 连接或内存状态当作可靠持久层。

## v1.2.27 HTTP contract

服务是 Hono/Bun HTTP server。所有 API 路由默认以 `process.cwd()` 为目录，也可对每个请求使用 query `directory=<absolute path>` 或请求头 `x-opencode-directory`；服务源码先 `Filesystem.resolve`，再建立对应 `Instance`。因此启动 cwd 只提供默认作用域，客户端应对每个请求明确发送已校验的目录，防止一次会话漂移到另一个项目。`GET /path` 返回 `directory`、`worktree`、配置和状态目录，可用于启动后确认边界。

建议基址 `http://127.0.0.1:<port>`，端点的 v1.2.27 路径如下（根路径没有 `/api` 前缀）：

| 用途 | 请求 | 结果 |
|---|---|---|
| 创建会话 | `POST /session?directory=...`，JSON 可为空或 `{title}` | `Session.Info`，含 `id` |
| 查询会话 | `GET /session?directory=...`；`GET /session/:sessionID?directory=...` | 会话列表/详情 |
| 发送同步 prompt | `POST /session/:id/message?directory=...` | `200`，JSON 流中写入一个 `{info: AssistantMessage, parts: Part[]}`；客户端应读到 EOF |
| 发送异步 prompt | `POST /session/:id/prompt_async?directory=...` | `204`，只表示已接受；后台错误需另查状态、消息或事件 |
| 消息历史 | `GET /session/:id/message?directory=...` | `MessageV2.WithParts[]`；支持 `limit`/`before` 游标 |
| 状态 | `GET /session/status?directory=...` | 以 session id 为键的状态记录（busy/idle 等） |
| 终止 | `POST /session/:id/abort?directory=...` | `true` |
| 事件 | `GET /event?directory=...` | SSE；先 `server.connected`，之后 bus event，10 秒 heartbeat |
| 待处理权限 | `GET /permission?directory=...` | `PermissionNext.Request[]` |
| 回复权限 | `POST /permission/:requestID/reply?directory=...`，`{reply, message?}` | `true` |
| 待处理问题 | `GET /question?directory=...` | `Question.Request[]` |
| 回复问题 | `POST /question/:requestID/reply?directory=...`，`{answers:[...]}` | `true` |
| 拒绝问题 | `POST /question/:requestID/reject?directory=...` | `true` |
| Agent 列表 | `GET /agent?directory=...` | Agent 配置与默认模型 |
| Provider/模型 | `GET /provider?directory=...` | 已配置 provider 与可用模型；不要猜模型名 |
| OpenAPI | `GET /doc?directory=...` | 运行时生成的 OpenAPI 3.1 |

`PromptInput` 的核心 body 是：

```json
{
  "parts": [{"type": "text", "text": "分析这批日志并输出 RCA"}],
  "model": {"providerID": "<internal-provider>", "modelID": "<internal-model>"},
  "agent": "<agent-name>",
  "variant": "<optional>",
  "system": "<optional>",
  "noReply": false
}
```

`model`、`agent`、`variant` 都是可选的；企业部署应先 `GET /provider`、`GET /agent`，从内部配置返回的 provider/model/agent 中选择，不在源码或前端硬编码公共 API 名称。`noReply:true` 只写入 user message，不启动 agent loop，适合注入上下文。

同步 `message` 端点适合短请求并直接等完整 assistant 响应；长 RCA 使用 `prompt_async`，随后轮询 `GET /session/status`、`GET /session/:id/message`、`GET /permission` 和 `GET /question`。v1.2.27 的事件端点是全局 bus SSE，源码没有按 session 的 replay cursor/Last-Event-ID 合同；断线后必须重连并以消息/状态轮询补偿。异步调用不要把 HTTP `204` 当作完成。

## 启动、认证和目录

源码中的 `serve` 只调用 `resolveNetworkOptions(args)` 再 `Server.listen`，命令行支持 `--port`、`--hostname`、`--mdns`、`--mdns-domain`、`--cors`。默认端口为 `4096`，默认 hostname 为 `127.0.0.1`；若把 port 设为 `0`，监听实现先尝试 `4096`，再回退到随机端口。启动 cwd 是默认项目目录，推荐从 standalone-log workspace 启动，随后每个请求显式指定客户 fork 的绝对路径。

设置 `OPENCODE_SERVER_PASSWORD` 后所有非 OPTIONS 请求启用 HTTP Basic Auth；用户名默认为 `opencode`，可由 `OPENCODE_SERVER_USERNAME` 覆盖。企业内置组件应始终设置密码，即使只绑定 loopback；如果绑定 `0.0.0.0` 或内网地址，更必须设置。密码只放进进程环境/受保护配置，不写日志、URL、仓库或文档。服务源码在未设置密码时会打印 unsecured 警告。

建议启动策略：以受控子进程从 standalone-log workspace 启动 `opencode serve --hostname 127.0.0.1 --port <reserved>`，等待 `/doc` 或 `/path` 成功后再创建 session；退出时先 abort/记录状态，再停止子进程。为客户 fork 设置绝对目录并在客户端校验其位于允许的 fork 根目录之下。不要依赖 `server` 配置块改变 serve 监听地址：v1.2.27 的 serve 命令直接读取网络 CLI 参数，已有 v1.2.27 issue 报告该配置被忽略。

## RCA prompt、agent/subagent、MCP

把可重复的 RCA 方法放进只读 `system`/agent prompt，例如：先按时间线重建失败链，再区分源码静态证据、运行日志证据和未验证假设，最后给出最小修复与回退。不要把秘密、完整环境变量或凭据放进 prompt。项目级 `.opencode/agents/*.md` 会被工作目录加载；Agent schema 支持 `mode: primary|subagent|all`、`model: {providerID, modelID}`、`permission`、`prompt`、`steps`。可以通过 `agent` 选择已配置 agent；复杂独立检索可使用配置好的 subagent，但应限制目录和权限，并把其结果视为待主 agent 审核的证据。

v1.2.27 的 config schema 支持 MCP：

```json
{
  "mcp": {
    "internal-log-tools": {
      "type": "local",
      "command": ["<approved-command>", "<arg>"],
      "environment": {"SAFE_SETTING": "value"},
      "enabled": true,
      "timeout": 5000
    },
    "internal-docs": {
      "type": "remote",
      "url": "https://<internal-host>/mcp",
      "enabled": true,
      "headers": {"X-Org-Route": "<non-secret-value>"}
    }
  }
}
```

本版本源码确认 local MCP 是 command 数组加可选 environment/enabled/timeout，remote MCP 是 URL 加 headers/OAuth/enabled/timeout；具体服务安装/连接可从配置或 `/mcp` API/OpenAPI 读取。只允许企业批准的 MCP，禁止 prompt 让模型自行安装任意包或执行未审计命令。配置加载会读取全局、`OPENCODE_CONFIG`、项目 `opencode.json{,c}`、`.opencode` 目录及企业 managed config；其中项目和 `.opencode` 会改变 agent/plugin/MCP，有必要时用受控 `OPENCODE_CONFIG` 隔离 standalone-log workspace。

## 日志 RCA 的落盘和 Git 规则

推荐目录形态：

```text
standalone-log/<case-id>/raw/       # 原始日志，默认不入客户源码 fork
standalone-log/<case-id>/session/   # Logviewer 索引、请求/响应摘要、session id
standalone-log/<case-id>/rca.md     # 最终 RCA
customer-fork/                       # 客户 fork 的 tracked source
```

Agent 默认只读 `customer-fork` 和 `standalone-log/<case-id>/raw`；写入 RCA 时只写 case 目录。若用户明确要求纳入 fork，UI 展示将要添加的精确相对路径、diff 和敏感信息扫描结果，由用户点击确认后执行 `git add -- <exact-file>`；是否 commit/push 另行明确授权。OpenCode session 数据通常写入其 state 目录，服务重启后可通过 session list/history 恢复，但 prompt_async 的后台执行、SSE 连接和 pending permission/question 不能作为唯一持久性保证；Logviewer 必须在每一步记录请求、HTTP 状态、session id、最后已读消息和轮询时间，并在重连后从 API 重读。

## 已知限制和采用的补偿

1. `/event` 是全局 SSE，v1.2.27 源码只保证连接、bus 事件和 heartbeat，没有文档化的 replay；采用“断线重连 + status/message/permission/question 轮询”。
2. `prompt_async` 源码返回 `204` 后后台调用没有把异常写回 HTTP；采用后台监控和 `GET /session/:id/message`/status 终态判定，记录错误响应。
3. permission/question 是跨 session 列表端点；客户端按 `sessionID` 过滤，只回复属于当前 case 的 requestID。
4. 版本 tag 已验证存在，但 v1.2.27 已有公开 issue 记录 Windows serve 技能目录和 serve 配置监听行为的边界；上线前应在目标 Windows 主机执行最小 smoke：启动、`/path`、创建 session、`prompt_async`、轮询完成、权限/问题 reply、abort、服务退出。

权限请求的源码类型来自 [`permission/next.ts`](https://raw.githubusercontent.com/anomalyco/opencode/v1.2.27/packages/opencode/src/permission/next.ts)：路由参数名虽叫 `requestID`，实际请求对象使用由 `PermissionID` 生成的 `id`；回复 body 是 `PermissionNext.Reply`，应从运行时对象和 `/doc` 读取允许值后再提交。问题路由同样以 `requestID` 作为 URL 参数，回复 body 为 `answers`，拒绝使用独立的 `/reject` 路由。客户端应兼容 `id` 字段并把它映射为内部 requestID，不能假设服务返回名为 `requestID` 的字段。

## 最小端到端顺序

```text
启动 serve(cwd=standalone-log, Basic Auth)
  -> GET /path，确认 directory/worktree
  -> GET /provider + /agent，选择内部模型/agent
  -> POST /session?directory=<customer-fork>
  -> POST /session/<id>/prompt_async?directory=<customer-fork>
  -> 循环 GET /session/status、/session/<id>/message、/permission、/question
  -> 需要时 reply/reject；用户取消时 POST /session/<id>/abort
  -> 保存最终 assistant parts + RCA 到 case 目录
  -> 可选：用户确认后 git add 精确 RCA 文件
```

## RCA 方法的主来源与落地

Google SRE 的[有效故障排查方法](https://sre.google/sre-book/effective-troubleshooting/)要求先恢复系统状态，再检查指标、日志和追踪，提出可证伪假设并通过受控实验反复验证；它还强调用统一 request identifier 串起跨组件日志。Logviewer 的诊断 recipe 因此要求时间线、观察证据、假设、验证动作和回滚方案分栏，禁止把推断写成事实。

Google SRE 的[无责事后复盘实践](https://sre.google/sre-book/postmortem-culture/)把影响、处置、根因和防复发行动作为复盘记录的固定内容，并要求审阅后归档、限制终端用户身份信息。Logviewer 将 AI 输出保存为 case 级 RCA，保留原始日志、请求/响应摘要和人工确认的后续动作；recipe 只辅助生成草稿，最终归因和写入 fork 仍需人工确认。

OpenTelemetry 的[日志规范](https://opentelemetry.io/docs/specs/otel/logs/)建议在 LogRecord 中保留 TraceId、SpanId 和 Resource context，以便按时间、执行上下文和来源关联日志、trace、metric。[.NET 日志关联示例](https://opentelemetry.io/docs/languages/dotnet/logs/correlation/)进一步说明 SDK 会从当前 Activity 填充 TraceId、SpanId、TraceFlags。若客户日志已有这些字段，RCA prompt 应优先按 trace/span 聚合，再按时间窗口和组件补齐缺口。

Google SRE 的[事件跟踪实践](https://sre.google/sre-book/tracking-outages/)建议集中记录告警、事件并可按历史问题分组分析；[事件管理章节](https://sre.google/sre-book/managing-incidents/)强调保留可供复盘的实时状态文档和明确交接。Logviewer 的 session JSON、原始 API 响应和最终 RCA 分开保存，分别承担运行状态、证据快照和审阅产物，避免把一次断线后的内存状态当作历史事实。

这些来源支持的可选 recipe 提示词仅包含诊断方法和证据格式，不自动执行生产变更、不自动提交 Git，也不引入公共模型 API；模型仍由企业内部 provider/model 配置决定。
