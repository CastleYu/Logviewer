# 源码索引与 IDE 跳转

通过 `npm run dev`（开发）或 `npm run build` 后 `npm start`（生产）启动本机服务，打开 `http://127.0.0.1:3000`。

1. 顶栏点击“源码索引”，填写源码根目录，每行一个绝对路径。
2. 为 PyCharm、IDEA、CLion 填写对应安装目录的 `bin/pycharm64.exe`、`bin/idea64.exe`、`bin/clion64.exe` 路径。只使用哪些 IDE，就配置哪些。
3. 点击“保存并重建索引”。递归索引所有普通文件，保留重名文件；重叠目录去重，不跟随符号链接/目录联接。不可读目录或超过一百万文件时此次构建失败，旧索引保留。
4. 默认根据格式中的 `source-file` 和 `source-line` 角色确定来源列，也可在设置中选择任意字段覆盖。覆盖按格式保存于浏览器，立即生效。
5. 在指定的文件名或源码行号单元格上右键，第一项为“打开源码”。行号取该日志的源码字段，不使用日志文件显示序号。

| 索引状态 | 菜单行为 | tooltip |
| --- | --- | --- |
| 唯一匹配 | .py → PyCharm；.java → IDEA；.c/.cpp → CLion | 程序、完整路径、源码行号 |
| 多个匹配 | 浮动卡片选择目标文件；只省略公共目录前缀 | 匹配数量与选择说明 |
| 没有匹配 | 打开项禁用 | 提示添加目录/重建索引 |

IDE 未配置、文件类型未映射、源码行号无效时也会禁用并说明原因。多选日志后打开操作仍只针对本次右键的那条记录，不批量启动 IDE。选择卡片上的完整路径保留在悬停说明中；Escape 或点击外部关闭。

目录和程序配置保存于项目根目录 `.logviewer-source.json`（Git 忽略）；启动时重新扫描目录生成内存索引。文件新增、移动或删除后点击重建；打开前再次检查文件是否存在且仍位于配置目录内。若启动时目录失效，主应用继续工作，设置界面显示错误供修正。

仅支持本机 Windows 浏览器访问本机服务。前端静态文件单独部署不能启动本机 IDE。所有 API 拒绝非本机 Host、跨站 Origin / Fetch-Metadata；源码接口额外要求自定义头。启动使用参数数组和 `shell:false`，目标必须来自索引，不接受网页指定任意启动程序。该边界不防御已控制本机进程或已可修改项目源码的攻击者。

执行 `node node_modules/tsx/dist/cli.mjs scripts/verify-source.ts` 验证索引、路径/参数、接口边界与恢复行为。`acceptance/source-fixtures` 提供内置十字段和 JSONL 两种日志及同名源码样本。JSONL 示例需要先切换到“JSON Lines 通用格式”，再把“消息”指定为文件名列。

JetBrains 的 `--line` 官方接口负责定位，浏览器提示“已发送至”代表启动器已接受进程启动请求，不代表 IDE 已完成载入或光标已被验证。目录和文件受 IDE 项目上下文、IDE 版本及操作系统前台切换限制影响。命令行规范：[PyCharm](https://www.jetbrains.com/help/pycharm/opening-files-from-command-line.html)、[IDEA](https://www.jetbrains.com/help/idea/opening-files-from-command-line.html)、[CLion](https://www.jetbrains.com/help/clion/opening-files-from-command-line.html)。
