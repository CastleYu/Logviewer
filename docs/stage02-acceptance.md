# Stage 02 验收记录

## 交付

内网 OpenCode v1.2.27 客户端、本地受管 Agent 进程、隔离日志/源码两种工作区、可选 RCA 提示词及主/子 Agent 安装、ERROR/选中行/全文分析、多会话浮窗、持久日志与对话、来源消歧历史窗口。

## 验证边界

| 层面 | 结果 |
|---|---|
| TypeScript / build | 通过；Vite 仍提示单 bundle 超过 500 kB，为体积建议，不是构建失败 |
| 原有功能 | 日志配置、堆栈、源码索引/打开器、远程浏览回归通过 |
| SSH | 真实服务器浏览/命令/下载；本机 SSH 服务验证连接复用、取消、重连和指纹隔离 |
| HistoryStore + HTTP | 同名不同来源、原文件改变后快照不变、重启恢复、源码关联、大文本、路径打开、内容路由通过 |
| 模拟 OpenCode 契约 | 异步完成、40KB 提示词、权限/追问、取消、多个会话、连接配置快照、精确 git 暂存通过 |
| 受管进程 | 真实子进程 fixture 验证认证、ready、按目录复用/隔离及清理通过 |
| **真实 OpenCode 1.2.27** | 精确二进制版本；认证/目录/session/messages/permission/question/provider/agent/abort/doc 均通过；真实 prompt_async 204 后调用本机 SSE 模型 fixture 一次并返回完成消息 |
| 生产包浏览器 | ERROR 分析、表格右键自动分析、全文取消不发送、确认发送、多会话创建/切换、重载及后端重启后恢复、源码模式和精确 git add、本地绝对路径、远端来源、权限/多问题回答、停止并清除 pending、浮窗缩放通过 |
| 视觉 | 桌面浅/深色和 390px 窄屏通过；修复既有错误导航遮挡 AI 按钮、数据写入触发开发热刷新、历史窗口在下载完成后不自动刷新的问题 |

真实 OpenCode 测试使用隔离的 HOME/XDG 工作目录和本机 OpenAI-compatible SSE fixture；没有调用公网模型。它证明参考版本接口链路可用，不证明企业内部定制模型的诊断质量。企业 fork 的实际能力、内部认证定制和模型质量仍需在其环境确认。

SMB 没有已注册共享可实测（注册文件为空），未猜测共享名或创建连接；其文件访问改动不宣称已有真实 SMB 验收。

## 可复现命令与本地证据

`npm run lint`、`npm run build`、`npm run verify:config`、`npm run verify:stack`、`npm run verify:source`、`npm run verify:sftp-browse`、`npm run verify:remote`、`npm run verify:history`、`npm run verify:ai`、`npm run verify:ai-runtime`。

精确版本脚本 `npm run verify:opencode-live` 需要项目忽略目录内的 1.2.27 Windows 二进制与隔离的 provider fixture；实际摘要为 `.logviewer-cache/opencode-qa/live-smoke-result.json`。QA 安装未修改全局 OpenCode 配置。

浏览器截图：`acceptance/stage02-ai-light.png`、`stage02-ai-dark.png`、`stage02-ai-narrow.png`。截图留在本机，没有把用户已有未提交截图并入提交。运行数据目录均被 Git 忽略。

使用方式见 [企业内网 AI 指南](enterprise-ai.md)；设计依据和精确源码链接见 [OpenCode 研究](stage02-opencode-research.md)。
