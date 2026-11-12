# LogViewer 界面核心特性模块清单

> 用于逐个模块确认交互需求。基线 `main` @ 69ecfc8。
> 状态：✅ 已确认（见对应文档） · ⏳ 本轮待确认 · 🔜 留档到第二轮改进 · 🗑 待删除

| # | 模块 | 用户看到的样子 / 入口 | 主要组件 | 状态 |
|---|---|---|---|---|
| M1 | 顶栏 | 页面最上方一行：文件名、格式、解析堆栈、源码、AI、历史、远程、打开、主题 | `AppHeader` | ✅ [ui-button-spec.md](ui-button-spec.md) |
| M2 | 调查栏（搜索 / 高亮 / 导出） | 顶栏下方一行：搜索框、高亮、复制导出 | `Toolbar` | ✅ 同上 |
| M3 | 首页 / 空状态 | 没打开日志时：拖入区、选择文件、远程服务器、按路径打开、最近打开、示例日志 | `DropZone` | 🔜 第二轮 |
| M4 | 文件加载 | 打开文件后的进度条、取消、失败提示 | `FileLoadBar` | 🔜 第二轮 |
| M5 | 日志表格（内置格式） | 主体表格：列、行高、选中、拖拽列宽、表头筛选按钮、行内高亮 | `VirtualLogTable`、`HighlightedText` | 🔜 第二轮 |
| M6 | 日志表格（自定义格式） | JSON / JSONL 等配置格式时的表格 | `ConfigurableLogTable` | 🔜 第二轮 |
| M7 | 表头筛选 | 点击列头的漏斗：级别、模块、线程、文本、序号、时间范围 | `ColumnFilterPopover`、`ConfiguredFieldFilterPopover`、`DateRangeFilter` | 🔜 第二轮（承接 T10/T11 删除后的全部筛选） |
| M8 | 堆栈单元格 | 表格中合并后的异常堆栈显示与展开 | `StackCell` | 🔜 第二轮 |
| M9 | 证据检查器 | 右侧面板：异常摘要、结构化字段、完整原文、源码跳转 | `LogInspector` | 🔜 第二轮 |
| M10 | 选中操作栏 | 选中行后表格底部的一行：已选 N 条、AI 分析、全选、清除 | `SelectionActionBar`、`CopyActionPopover` | 🔜 第二轮（导出已按 T14 移走） |
| M11 | 错误浮动导航 | 表格右下角浮动、可拖动 | `FloatingErrorNav` | ✅ T15/T16 |
| M12 | 源码导航 | 点击文件名/行号跳到 IDE；源码目录与索引设置；打开程序切换 | `SourceNavigation`、`SourceSettings`、`SourceIndexItem`、`SourceOpener*` | 🔜 第二轮（顶栏按钮 H4/H5 不改，但跳转菜单本身待确认） |
| M13 | 远程工作台 | 浏览服务器目录、执行命令、打开远程日志 | `RemoteWorkbench`、`RemoteFileList`、`RemotePathBar`、`RemoteConsole`、`RemoteServerEditor` | 🔜 第二轮（你认为比原来好，可只做细节） |
| M14 | 远程大文件打开 | 打开大文件前选：整个文件 / 只看末尾 N MB / 下载到本机 | `RemoteOpenSheet` | 🔜 第二轮 |
| M15 | 本机路径打开 | 输入或选择本机路径打开日志 | `LocalFileDialog`、`PathPicker` | 🔜 第二轮 |
| M16 | 历史日志 | 最近打开过的日志 | `HistoryBrowser` | ✅ H7（改为下拉） |
| M17 | 调查视图 | 保存 / 恢复一整套筛选和显示设置 | `InvestigationViewDialog` | 🔜 第二轮（入口随「视图」移到顶栏） |
| M18 | 视图设置 | 行密度、换行、网格线、列显示、列宽、经典样式 | `Toolbar` 视图菜单 | 🔜 第二轮（位置已定 T13，内容待确认） |
| M19 | AI 工作区 | 对话、分析选中日志、设置、仓库绑定 | `AiWorkspace`、`AiConversation`、`AiActivity`、`AiQuestionForm`、`AiSettings`、`FloatingPanel` | ⏳ [ai-workspace-ui-requirements.md](ai-workspace-ui-requirements.md) |
| M20 | 主题与配色 | 深浅色、级别颜色、高亮颜色 | `index.css`、`highlightColors` | ✅ H2/H11/T 高亮 |
| M21 | 快捷键与提示 | 全局快捷键、Esc 层级、悬停提示 | 分散在各组件 | 🔜 第二轮（提示样式已定 G-1） |
| — | 遗留组件 | 已无引用：底部状态栏、旧堆栈弹窗 | `StatusBar`、`StackDetail` | 🗑 |

## 建议确认顺序
按使用频率：M5/M6 表格 → M7 表头筛选 → M9 检查器 → M10 选择栏 → M3 首页 → M18/M17 视图 → M12 源码导航 → M13/M14/M15 打开类 → M4 加载 → M8 堆栈 → M21 快捷键 → M19 AI。
