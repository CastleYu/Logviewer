# LogViewer 界面核心特性模块清单

> 用于逐个模块确认交互需求。基线 `main` @ 69ecfc8。
> 状态：✅ 已确认（见对应文档） · ⏳ 本轮待确认 · 🔜 留档到第二轮改进 · 🗑 待删除

| # | 模块 | 用户看到的样子 / 入口 | 主要组件 | 状态 |
|---|---|---|---|---|
| M1 | 顶栏 | 页面最上方一行：文件名、格式、源码、视图、AI、历史、远程、打开、主题 | `AppHeader` | ✅ [ui-button-spec.md](ui-button-spec.md)（H3 移入视图菜单） |
| M2 | 调查栏（搜索 / 高亮 / 导出） | 顶栏下方一行：搜索框、高亮、复制导出 | `Toolbar` | ✅ 同上 |
| M3 | 首页 / 空状态 | 三列等高首页：拖放与文件/远程/示例、最近打开、远程服务器搜索列表 | `DropZone` | ✅ [ui-round2-requirements.md](ui-round2-requirements.md) |
| M4 | 文件加载 | 打开文件后的进度条、取消、失败提示 | `FileLoadBar` | 🔜 待后续确认 |
| M5 | 日志表格（内置格式） | 主体表格：列、行高、选中、拖拽列宽、表头筛选、行内高亮、内联堆栈 | `VirtualLogTable`、`HighlightedText`、`LineJumpHeader` | 🔜 表格主体待后续确认（H2/T12/M9 已集成） |
| M6 | 日志表格（自定义格式） | JSON / JSONL 等配置格式时的表格 | `ConfigurableLogTable`、`LineJumpHeader` | 🔜 同上 |
| M7 | 表头筛选 | 点击列头的漏斗：级别、模块、线程、文本、序号、时间范围及前后区间 | `ColumnFilterPopover`、`ConfiguredFieldFilterPopover`、`DateRangeFilter` | 🔜 T10/T11 区间筛选已集成 |
| M8 | 堆栈与异常链（v3） | 表格消息列下方行内堆栈卡片、依赖折叠、左侧复制与源码跳转、`Alt+S` 原文 | `InlineStackTrace`、`stackClassify`、`StackCell` | ✅ [ui-round2-requirements.md](ui-round2-requirements.md) |
| M9 | 证据检查器（已由 M8 v3 替代） | 原右侧独立面板已被行内堆栈卡片替代，源码与复制能力已收敛至行内与右键 | `InlineStackTrace`（原 `LogInspector` 已摘除引用） | ✅ [ui-round2-requirements.md](ui-round2-requirements.md) |
| M10 | 选中操作栏 | 固定于表格底部 32px：全选筛选结果、已选计数与 Esc 清空、显示 M/K 统计 | `SelectionActionBar` | ✅ [ui-round2-requirements.md](ui-round2-requirements.md) |
| M11 | 错误浮动导航 | 表格右下角浮动、可拖拽与双击复位 | `FloatingErrorNav` | ✅ T15/T16 |
| M12 | 源码导航 | 点击文件名/行号跳到 IDE；源码目录、业务/依赖前缀设置与打开程序切换 | `SourceNavigation`、`SourceSettings`、`SourceIndexItem`、`SourceOpenerSwitch` | 🔜 含 v3 前缀规则与 Portal 开关 |
| M13 | 远程工作台 | 浏览服务器目录、执行命令、打开远程日志 | `RemoteWorkbench`、`RemoteFileList`、`RemotePathBar`、`RemoteConsole`、`RemoteServerEditor` | 🔜 待后续确认 |
| M14 | 远程大文件打开 | 打开大文件前选：整个文件 / 只看末尾 N MB / 下载到本机 | `RemoteOpenSheet` | 🔜 待后续确认 |
| M15 | 本机路径打开 | 输入或选择本机路径打开日志 | `LocalFileDialog`、`PathPicker` | 🔜 待后续确认 |
| M16 | 历史日志 | 顶栏下拉与完整列表弹窗，自动过滤示例日志 | `AppHeader`、`HistoryBrowser` | ✅ H7 |
| M17 | 调查视图 | 保存 / 恢复一整套筛选和显示设置（入口位于顶栏视图菜单） | `InvestigationViewDialog` | 🔜 入口按 T13 移入顶栏 |
| M18 | 视图设置 | 行密度、自动换行、网格线、列显隐、解析堆栈与 `Alt+S` 原文模式 | `AppHeader` 视图菜单 | 🔜 T13 + M9 v3 已接入 |
| M19 | AI 工作区 | 对话、分析选中日志、设置、仓库绑定 | `AiWorkspace`、`AiConversation`、`AiActivity`、`AiQuestionForm`、`AiSettings`、`FloatingPanel` | ⏳ [ai-workspace-ui-requirements.md](ai-workspace-ui-requirements.md) |
| M20 | 主题与配色 | 深浅色、语义级别颜色、青绿搜索高亮与高亮预设 | `index.css`、`highlightColors`、`uiConstants` | ✅ H2/H11/T 高亮 |
| M21 | 快捷键与提示 | Portal 400ms Tooltip、`Esc` 分级、`Alt+S`、`F2`/`Shift+F2`、`Ctrl+G`、`Ctrl+F` | `Tooltip`、全局/局部事件监听 | 🔜 G-1 与新增快捷键已接入 |
| — | 遗留组件 | 已无引用：底部状态栏、旧堆栈弹窗、右侧检查器 | `StatusBar`、`StackDetail`、`LogInspector` | 🗑 |

## 建议确认顺序
按使用频率：M5/M6 表格 → M7 表头筛选 → M9 检查器 → M10 选择栏 → M3 首页 → M18/M17 视图 → M12 源码导航 → M13/M14/M15 打开类 → M4 加载 → M8 堆栈 → M21 快捷键 → M19 AI。
