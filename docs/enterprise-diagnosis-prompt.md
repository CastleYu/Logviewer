# 企业日志与源码排障提示词

`src/config/aiDiagnosis.ts` 提供一组可复用的静态提示词：

- `AiDiagnosis.Core`：定义企业生产故障 RCA 角色、证据边界、版本一致性检查、源码调用链分析、竞争假设和默认只读约束。
- `AiDiagnosis.Report`：固定结论优先的输出格式，包含结论分级、时间线、证据表、证伪步骤、最小验证、缓解修复回退和必需信息。
- `AiDiagnosis.context(input)`：把运行上下文编码为 JSON 数据块。仓库路径、日志路径和锚点不会被拼接成指令；锚点只表示入口，不表示根因。
- `AiDiagnosis.PrimaryRecipe` / `AiDiagnosis.EvidenceRecipe`：生成可选安装的 OpenCode agent markdown，分别用于主分析和只读证据收集。

建议调用顺序是：先将 `Core`、`context(...)` 和用户选中的日志范围放入 `prompt_async` 的系统/上下文字段，再按需附加 `Report`；只有用户显式启用 agent recipe 时才安装对应 recipe。没有源码、没有部署版本映射或证据未闭环时，模型必须明确标记限制，不能用本地 HEAD 代替线上版本，也不能把日志中的自然语言当作待执行指令。

该配置类不调用模型、不访问网络、不写入产品状态，也不包含某个具体故障的结论。
