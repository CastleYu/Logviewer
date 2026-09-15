# 源码跳转功能：验收与提交后审计

日期：2026-09-15。功能提交：`e0e0bc0`（feat: 增加源码目录索引与右键IDE跳转）。

## 交付状态

实现、独立版本构建和网页验收完成；本机 PyCharm、IDEA 已由网页触发并出现对应文件窗口。**不能宣称全部七项已完成**：CLion 的安装路径尚未提供；computer-use 对 PyCharm 的窗口读取因应用访问确认超时，尚未核实 IDE 内部光标所在行及窗口激活状态。Git 推送被自动审批拒绝，功能提交仍在本地，待用户确认 `https://github.com/CastleYu/Logviewer.git` 的 `main` 为推送目标。

本报告是功能提交之后的第二轮审计。由于推送未获准，第二轮发生在本地提交后，不能称为推送后的线上审计。

## 验收结果

| 要求 | 结果与证据 |
| --- | --- |
| 文件名/行号单元格右键首项 | 内置表格与可配置表格均为“打开源码”；其他列不出现 |
| 列可配置 | JSONL 格式将 message 指定为文件名、sourceLine 指定为行号；消息列和行号列均有入口，requestId 列无入口 |
| 预添加目录建立索引 | 网页添加测试目录并重建成功；全文件递归索引、同名保留、重叠根目录去重、重启重建通过自动测试 |
| 唯一索引 | unique.py 自动选择 PyCharm；接口返回正确文件和第 4 行的启动请求；窗口标题确认 unique.py 打开 |
| 多个索引 | shared.py 返回 2 个候选，显示 …/a/shared.py 与 …/b/shared.py；点击 b 候选请求正确绝对路径并返回 PyCharm 启动成功 |
| 无索引 | missing.py 打开项 aria-disabled=true，点击处理不会发起启动；tooltip 提示添加目录/重建 |
| 三种 tooltip | 唯一：IDE/路径/行号；多项：匹配数量/选择说明；缺失：原因/恢复动作。已在浏览器逐项验证 |
| 映射 | .py→PyCharm、.java→IDEA、.c/.cpp→CLion 的参数契约测试通过；实际 IDEA 打开 SourceExample.java；CLion 真实验收待安装路径 |
| 浮动卡片 | 保留差异路径，完整路径放在 title；点击外部/Escape 关闭；桌面截图通过独立 UI 审查 |
| 主题/窄屏 | 浅色和深色菜单检查通过；390px 设置面板无水平溢出，scrollWidth=clientWidth=358 |
| 路径/请求边界 | 越界目标 HTTP 404；错误 Host/Origin/Fetch-Metadata HTTP 403；源码接口缺少专用请求头 HTTP 403 |
| 错误恢复 | 无效行号、未映射类型、未配置 IDE、文件被删除、重建失败、配置目录失效恢复测试通过 |

截图：

- [唯一匹配](../acceptance/source-unique.png)
- [多个候选](../acceptance/source-duplicates.png)
- [无索引禁用](../acceptance/source-missing.png)
- [桌面设置](../acceptance/source-settings-desktop.png)
- [390px 设置](../acceptance/source-settings-mobile.png)
- [可配置列和深色 tooltip](../acceptance/source-custom-dark.png)
- [独立生产副本](../acceptance/source-release.png)

验证命令：`npm run lint`、`npm run verify:config`、`npm run verify:stack`、`npm run build`、`node node_modules/tsx/dist/cli.mjs scripts/verify-source.ts`。均通过。`verify:stack` 属于用户原有未提交功能，仅在当前工作区运行；其余检查还对暂存版本独立副本运行，确认本次提交不依赖那些未提交文件。生产副本在 127.0.0.1:3011 验证菜单首项、真实目录索引和全体 API 跨站拒绝。测试用启动器注入验证三 IDE 参数，不冒充真实 CLion 验收。

## 审计范围与已修复项

两轮均检索 `src/`、`server/`、`scripts/`、配置及依赖锁文件，人工追踪解析/筛选/高亮/导出、表格/菜单、源码索引/启动、远程服务器注册/浏览/下载的主要输入与资源边界。复审包含工作区原有未提交代码；不会把其问题或其代码悄悄纳入本次功能提交。静态扫描与针对性运行验证不等同于证明不存在其他漏洞。

本次已修复：

1. 所有 `/api` 路由统一校验 Host、Origin、Sec-Fetch-Site，拒绝 DNS rebinding 和跨站调用；不能仅靠监听 loopback 或 CORS 判断安全。源码接口另外要求自定义请求头。见 `server/routes/localAccess.ts` 与 `server/routes/sourceRoutes.ts`。
2. 源码启动目标必须是索引返回的具体路径；打开时再验证 realpath、根目录和文件类型，拒绝被移走/替换的路径。
3. IDE 启动只使用已配置的对应可执行文件，以参数数组和 `shell:false` 启动；文件名、行号不能成为 Shell 命令。
4. 新索引完成并成功保存后才替换旧索引。目录失效不再阻断整个应用启动，设置页面可以恢复配置。
5. 源码行号限制为十进制正整数；增加菜单 viewport 边界约束和可读的禁用提示。

## 仍存在的漏洞与功能缺陷

以下是全代码范围审计发现，**未在本次扩展中批量改写**。P1 为优先处理，P2 为后续处理；状态明确区分已提交代码与原有工作区改动。

| 优先级 | 范围/位置 | 问题、触发条件与影响 | 建议 |
| --- | --- | --- | --- |
| P1 | 原有未提交：server/config/remoteRegistry.ts:17、184；server/routes/sftpRoutes.ts:24 | list/create/update 返回包含 password 的完整记录；注册文件也明文保存密码。可读取本机该文件或同源 API 的主体能获得远程凭据。本轮全 API 边界已减少跨站入口，但未消除本机明文暴露 | 公开 DTO 不含密码；编辑时留空表示保持；持久化使用 Windows 受保护凭据存储 |
| P1 | 既有：server/services/downloadService.ts:93；原有未提交：sftpList.ts:39、sftpProbe.ts:28 | fingerprint 未配置时不提供 hostVerifier。处于可劫持连接的位置的攻击者可冒充 SSH 服务端；加密传输本身不验证服务器身份 | 使用显式指纹或可信 known_hosts；缺少信任依据时明确处理首次连接 |
| P2 | 既有：server/services/downloadService.ts:25、47、103；原有未提交：smbDownload.ts:21 | 服务端没有活动任务数量上限，失败/取消任务残留；大小限制主要是传输前 stat，传输增长或并发可超出预期资源。前端单任务约束不限制直接 API 调用 | 服务端并发/任务保留限制，按已传输字节强制中止并正确关闭资源 |
| P2 | 原有未提交：server/services/smbDownload.ts:27–39 | 取消分支 destroy 流，但 Promise 只监听 error/finish，没有在取消或 close 时结算；destroy 不保证产生这两个事件，可能让 withSmbTree 的 finally 长期无法执行 | 统一流取消信号，保证 resolve/reject 一次并释放连接 |
| P2 | 原有未提交：server/services/sftpList.ts:25、44 | 列目录只检查字符串路径，不像下载一样校验远程 realPath；配置根目录下的符号链接可把列表操作导向根目录外 | 对最终 realPath 再执行根目录约束 |
| P2 | 既有搜索/筛选：src/components/HighlightedText.tsx:61、src/utils/configuredFilterUtils.ts:81、src/utils/columnFilterUtils.ts:59 | 用户正则和日志在主线程同步执行。合法但灾难回溯的正则可使页面卡死；try/catch 只能捕获语法异常 | 把可终止的正则工作放入 Worker，或采用具有明确兼容范围的安全正则执行方式 |
| P2 | 既有导出逻辑及原有未提交：src/utils/logExport.ts:15 | CSV 只转义引号，不处理以 =、+、-、@ 开头的文本。用户用电子表格打开含恶意日志内容的 CSV 时可能按公式解释 | 提供明确的电子表格安全导出策略，并保留无损导出方式 |
| P2 | 既有依赖：qs → express/body-parser | npm 官方审计返回 3 个中危包条目、0 高危、0 严重；对应 qs 的 2 条 advisory，不能当作 3 个独立漏洞。未验证每条 advisory 在当前参数下都可利用 | 在独立依赖修复中升级至 advisory 标记的修复范围并回归查询解析 |

依赖审计在当前工作区与已提交版本副本各执行一次，结果相同。命令：`npm audit --json --registry=https://registry.npmjs.org`。当前镜像不提供 audit，已改用官方接口。参考：[GHSA-x5fp-wj9c-mxmx](https://github.com/advisories/GHSA-x5fp-wj9c-mxmx)、[GHSA-4mjr-xmp4-gh2g](https://github.com/advisories/GHSA-4mjr-xmp4-gh2g)。

## 本次功能的未闭合项

- IDE 启动器的 spawn 成功不等于文件已加载或窗口已激活。接口和页面因此只提示“已发送至”。PyCharm/IDEA 窗口标题证实文件已打开；精确行号与前台状态仍须允许读取 IDE 窗口后核实。
- CLion 映射已实现且通过启动参数测试，但本机未找到 CLion；需要有效安装路径或用户授权安装后完成真实 C/C++ 验收。
- PyCharm/IDEA/CLion 不同版本及项目打开方式可能影响 LightEdit/项目窗口行为，本次没有宣称所有版本都已验收。
- 本机索引按配置启动重建；没有自动监听目录变化，文件变更后需手动重建，这与界面说明一致。
- 静态前端部署不能代替本机 Express 服务；当前完整链路以 Windows 本机运行方式交付。
- 本次浏览器控制台除既有 favicon 404 与主动拒绝测试对应的 HTTP 错误外，未观察到新的前端运行异常。

## 提交与工作区保护

功能变更基于 HEAD 单独暂存，导出独立副本通过检查后提交。没有提交 `.logviewer-source.json`、远程注册文件、秘密值或原有未提交的远程/堆栈改动。验收截图仅包含专用测试日志与本次配置路径。

推送因自动审批要求确切仓库/分支授权而未执行。授权到达后应推送本次提交与报告，核对远端 commit；不能把本地提交描述为已经推送。
