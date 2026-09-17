# LogViewer 配置契约指南（开发者 / Agent）

本文档是 `public/logviewer.config.json` 的配置入口，也是开发者和 Agent 修改日志格式时应遵循的操作协议。

权威文件：

- 运行配置：`public/logviewer.config.json`
- JSON Schema：`public/logviewer.config.schema.json`
- TypeScript 契约：`src/config/logFormatTypes.ts`
- 配置校验：`src/utils/logConfigLoader.ts`
- 自动验收：`npm run verify:config`

## 1. 不可违反的约束

1. `contractVersion` 新配置使用 `1.1`；加载器仍兼容 `1.0`。
2. 不得创建或覆盖保留格式 ID：`builtin-standard-bracket-v1`。
3. `fields[].id` 在一个格式内必须唯一，解析器、筛选器和复制动作只能引用已声明字段。
4. 每个字段必须明确声明 `type` 和 `filter.kind`；不筛选时使用 `none`。
5. 一个语义 `role` 在同一格式中最多出现一次。
6. `datetime` 字段必须声明至少一种 `datetime.formats`。
7. 新版 `copy` 与旧版 `display.copyable` 不能同时出现在同一字段。
8. 一个可见列最多注册一个 `cell` 复制动作。
9. 不在配置中写 JavaScript、表达式或可执行模板。组合复制只能使用结构化 `parts`。
10. 修改后必须运行 `npm run verify:config`、`npm run lint`、`npm run build`。

内置“标准十字段（兼容现版本）”始终是格式选择器第一项。外部格式从第二项开始，不会覆盖内置解析与表格兼容路径。

## 2. Agent 修改流程

Agent 应严格按以下顺序工作：

1. 读取本文件、`public/logviewer.config.json` 和 Schema。
2. 复制最接近目标日志的现有 `formats[]` 条目，不复制内置保留 ID。
3. 先确定记录边界 `record`，再确定解析器 `parsers`。
4. 收集解析器输出字段，并逐一声明到 `fields`。
5. 为字段配置显示、筛选和单字段复制。
6. 如需组合复制，再声明格式级 `copyActions`。
7. 为典型输入增加 `tests`，至少覆盖关键字段。
8. 运行三项验证命令；任何一项失败都不得宣称配置完成。
9. 用真实样例打开页面，确认格式选择、解析、筛选和复制结果。

不要顺手改动无关格式、视觉样式、解析失败策略或已有测试数据。

## 3. 最小可运行模板

```json
{
  "$schema": "./logviewer.config.schema.json",
  "contractVersion": "1.1",
  "defaultFormat": "my-json-lines-v1",
  "formats": [
    {
      "id": "my-json-lines-v1",
      "name": "My JSON Lines",
      "enabled": true,
      "record": {
        "mode": "line",
        "encoding": "utf-8",
        "skipEmpty": true
      },
      "parsers": [
        {
          "id": "json-line",
          "kind": "json",
          "bindings": {
            "timestamp": "$.time",
            "level": "$.level",
            "message": "$.message"
          }
        }
      ],
      "onParseFailure": {
        "action": "reject",
        "messageField": "message"
      },
      "fields": [
        {
          "id": "timestamp",
          "label": "时间戳",
          "role": "timestamp",
          "type": "datetime",
          "required": true,
          "datetime": {
            "formats": ["ISO-8601"],
            "timezone": "preserve"
          },
          "display": { "visible": true, "width": 190 },
          "filter": {
            "kind": "datetime-range",
            "inclusiveStart": true,
            "inclusiveEnd": true,
            "timezoneSelectable": true
          }
        },
        {
          "id": "level",
          "label": "级别",
          "role": "level",
          "type": "enum",
          "display": { "visible": true, "width": 88, "align": "center" },
          "filter": {
            "kind": "select",
            "selection": "multiple",
            "options": ["DEBUG", "INFO", "WARN", "ERROR"],
            "combine": "or"
          }
        },
        {
          "id": "message",
          "label": "消息",
          "role": "message",
          "type": "string",
          "required": true,
          "display": { "visible": true, "width": 480, "grow": true },
          "copy": {
            "enabled": true,
            "label": "复制消息",
            "placements": ["cell", "header", "context-menu"]
          },
          "filter": {
            "kind": "text",
            "defaultOperator": "contains",
            "allowRegex": true,
            "caseSensitiveDefault": false
          }
        }
      ],
      "tests": [
        {
          "name": "基本 JSON 记录",
          "input": "{\"time\":\"2026-09-01T08:00:00Z\",\"level\":\"INFO\",\"message\":\"ready\"}",
          "expect": {
            "parser": "json-line",
            "fields": {
              "level": "INFO",
              "message": "ready"
            }
          }
        }
      ]
    }
  ]
}
```

## 4. 顶层和格式字段

| 路径 | 必需 | 说明 |
|---|---:|---|
| `$schema` | 否 | 建议保留，供 IDE 和 Agent 校验 |
| `contractVersion` | 是 | 新配置使用 `1.1`；兼容读取 `1.0` |
| `defaultFormat` | 否 | 默认外部格式 ID；无效时回退内置格式 |
| `formats` | 是 | 外部日志格式数组 |
| `formats[].id` | 是 | 稳定、唯一、不可使用内置保留 ID |
| `formats[].name` | 是 | 格式选择器显示名称 |
| `formats[].enabled` | 否 | `false` 时不加载，默认启用 |
| `formats[].record` | 是 | 当前仅支持逐行记录 |
| `formats[].parsers` | 是 | 按数组顺序尝试 |
| `formats[].fields` | 是 | 解析、显示、筛选、复制的字段注册表 |
| `formats[].copyActions` | 否 | 多字段组合复制动作 |
| `formats[].tests` | 否 | 建议至少一条，加载时执行 |

`match.filePatterns`、`match.probe` 和 `match.priority` 已进入契约，但当前界面仍由用户明确选择格式，不会自动覆盖用户选择。

## 5. 记录与解析器

记录配置当前固定为逐行：

```json
{
  "record": {
    "mode": "line",
    "encoding": "utf-8",
    "skipEmpty": true
  }
}
```

### 5.1 JSON Lines

```json
{
  "id": "json-line",
  "kind": "json",
  "bindings": {
    "message": "$.message",
    "requestId": "$.context.requestId"
  }
}
```

JSONPath 当前仅支持从 `$` 开始的对象属性路径。

### 5.2 正则表达式

```json
{
  "id": "regex-main",
  "kind": "regex",
  "pattern": "^(?<timestamp>\\S+)\\s+(?<level>\\w+)\\s+(?<message>.*)$",
  "flags": "",
  "remainderField": "message",
  "partial": false
}
```

命名捕获组名称必须对应 `fields[].id`。

### 5.3 方括号字段

```json
{
  "id": "bracketed-main",
  "kind": "bracketed",
  "open": "[",
  "close": "]",
  "nested": true,
  "bindings": {
    "timestamp": 0,
    "level": 1,
    "message": 2
  }
}
```

### 5.4 锚定方括号字段

适用于中间消息可能包含额外方括号的日志：

```json
{
  "id": "anchored-main",
  "kind": "anchored-bracketed",
  "open": "[",
  "close": "]",
  "head": ["timestamp", "level"],
  "body": "message",
  "tail": ["module", "fileName", "lineNumber"]
}
```

## 6. 字段注册

字段类型：

- `string`
- `integer`
- `number`
- `boolean`
- `datetime`
- `enum`
- `json`

语义角色：

- `timestamp`
- `level`
- `message`
- `request-id`
- `function`
- `thread-id`
- `memory-address`
- `module`
- `source-file`
- `source-line`

角色用于通用显示和业务语义，不代替字段 ID。一个角色在同一格式中只能出现一次。

### 6.1 标准化

```json
{
  "normalize": [
    { "op": "trim" },
    { "op": "uppercase" },
    {
      "op": "map",
      "values": {
        "WARNING": "WARN",
        "ERR": "ERROR"
      }
    }
  ]
}
```

支持 `trim`、`uppercase`、`lowercase`、`map`。

### 6.2 显示

```json
{
  "display": {
    "visible": true,
    "width": 160,
    "grow": false,
    "align": "left"
  }
}
```

- `visible: false`：字段不显示，但仍可用于筛选、导出和组合复制。
- `width`：初始列宽，最小值 48。
- `grow`：占用剩余宽度，通常只给消息字段。
- `align`：`left`、`center`、`right`。
- `display.copyable`：仅供 `1.0` 旧配置兼容，新配置改用字段级 `copy`。

## 7. 筛选注册

| `filter.kind` | 字段类型 | 行为 |
|---|---|---|
| `none` | 任意 | 不显示筛选入口 |
| `text` | `string`、`json` | 包含、大小写、可选正则 |
| `number-range` | `integer`、`number` | 最小值和最大值 |
| `datetime-range` | `datetime` | 起止时间、边界、输入时区 |
| `select` | `string`、`enum`、`boolean` | 单选或多选 |

不同字段之间使用 AND；同一字段多选值使用 OR。全局搜索仍负责定位，不改变字段筛选组合规则。

### 文本

```json
{
  "kind": "text",
  "defaultOperator": "contains",
  "allowRegex": true,
  "caseSensitiveDefault": false
}
```

### 数值范围

```json
{
  "kind": "number-range",
  "inclusiveMin": true,
  "inclusiveMax": true
}
```

### 日期范围

```json
{
  "kind": "datetime-range",
  "inclusiveStart": true,
  "inclusiveEnd": true,
  "timezoneSelectable": true
}
```

### 枚举选择

固定值：

```json
{
  "kind": "select",
  "selection": "multiple",
  "options": ["DEBUG", "INFO", "WARN", "ERROR"],
  "combine": "or"
}
```

从当前日志取唯一值：

```json
{
  "kind": "select",
  "selection": "single",
  "searchable": true,
  "optionsSource": "distinct-values"
}
```

## 8. 单字段复制

新配置在字段上声明 `copy`：

```json
{
  "copy": {
    "enabled": true,
    "label": "复制函数名",
    "placements": ["cell", "header", "context-menu"]
  }
}
```

`placements`：

| 值 | 入口与范围 |
|---|---|
| `cell` | 单元格悬停或键盘聚焦时复制当前行字段值 |
| `header` | 表头复制菜单，可选择已选行或全部筛选结果 |
| `context-menu` | 日志右键菜单；右键行在选择集合内时作用于全部已选行 |

省略 `placements` 时默认启用三种入口。`enabled: false` 不注册动作。

### 1.0 兼容写法

```json
{
  "display": {
    "copyable": true
  }
}
```

该写法只注册 `cell` 复制，继续可用但不应出现在新的 `1.1` 配置中。

## 9. 组合复制

组合动作声明在格式级 `copyActions`：

```json
{
  "copyActions": [
    {
      "id": "source-location",
      "label": "复制 文件:行号",
      "anchorField": "fileName",
      "placements": ["cell", "header", "context-menu"],
      "parts": [
        { "kind": "field", "field": "fileName" },
        { "kind": "literal", "value": ":" },
        { "kind": "field", "field": "lineNumber" }
      ],
      "rows": {
        "separator": "\n",
        "missing": "empty"
      }
    }
  ]
}
```

### parts DSL

| `kind` | 必需字段 | 说明 |
|---|---|---|
| `field` | `field` | 读取当前日志的已声明字段 |
| `literal` | `value` | 写入固定文本，不执行表达式 |

`parts` 必须至少包含一个 `field`。字段按数组顺序拼接。

### anchorField

`anchorField` 决定 `cell` 和 `header` 入口显示在哪一列。它必须存在；使用这些入口时还必须是可见列。

同一锚点列最多只能有一个 `cell` 动作，避免单元格中出现无法区分的多个复制按钮。多个动作仍可以注册到 `context-menu`。

### 多行规则

| `rows.missing` | 行为 |
|---|---|
| `empty` | 缺失字段按空字符串输出，保留该行位置 |
| `skip-row` | 当前行任一字段缺失时跳过整行 |
| `disable` | 任一目标行缺失字段时拒绝复制并显示原因 |

`rows.separator` 默认是换行符 `\n`。数字 `0` 和布尔值 `false` 是有效值；对象与数组使用紧凑 JSON 输出。

## 10. 复制交互规则

- 单元格复制只复制当前行。
- 表头复制必须让用户明确选择“已选行”或“筛选结果”，不能静默猜测范围。
- 右键行未选中时，将该行设为唯一选择；右键已选中行时，作用于全部已选行。
- 复制成功显示动作名称和实际行数。
- 浏览器拒绝剪贴板权限时显示“剪贴板写入失败，请检查浏览器权限后重试”。
- 解析字段 `source-line` 与表格左侧日志序号不是同一数据；组合文件位置时应引用解析字段 ID。

## 11. 配置错误代码

常见复制相关错误：

| 错误码 | 原因 | 修复 |
|---|---|---|
| `CFG_COPY_ACTION_ID_DUPLICATE` | 动作 ID 为空或重复 | 为每个动作分配唯一 ID |
| `CFG_COPY_FIELD_UNKNOWN` | `parts` 为空、没有字段，或引用未知字段 | 先在 `fields` 注册字段，再修正 `parts` |
| `CFG_COPY_ANCHOR_INVALID` | 锚点不存在，或用于单元格/表头时不可见 | 改用存在且可见的字段 |
| `CFG_COPY_CELL_CONFLICT` | 同一列注册多个 `cell` 动作 | 保留一个单元格动作，其余改为右键入口 |
| `CFG_COPY_CONFIG_CONFLICT` | 同一字段同时声明 `copy` 与 `display.copyable` | `1.1` 中删除旧布尔值 |

坏的外部格式不会替换内置格式。页面会保留可用格式并显示配置错误。

## 12. 内嵌 tests

```json
{
  "tests": [
    {
      "name": "错误级别映射",
      "input": "{\"level\":\"err\",\"message\":\"failed\"}",
      "expect": {
        "parser": "json-line",
        "fields": {
          "level": "ERROR",
          "message": "failed"
        }
      }
    }
  ]
}
```

测试输入是一条完整记录。`expect.fields` 只需列出需要断言的字段。

## 13. 1.0 → 1.1 迁移

1. 将 `contractVersion` 改为 `1.1`。
2. 把每个 `display.copyable: true` 替换为字段级 `copy`。
3. 如果原 UI 硬编码了字段拼接，将其改成 `copyActions[].parts`。
4. 为批量复制加入 `header`，为多选右键复制加入 `context-menu`。
5. 运行契约验证并在浏览器核对剪贴板结果。

不需要迁移的 `1.0` 文件仍可加载；旧 `copyable` 只保留单元格复制行为。

## 14. 完成检查清单

开发者或 Agent 在交付前逐项确认：

- [ ] JSON 可以解析，Schema 无结构错误。
- [ ] 格式 ID 和字段 ID 唯一，没有使用保留 ID。
- [ ] 每个解析器绑定都能在 `fields` 找到。
- [ ] 每个字段的类型、角色、筛选器相互兼容。
- [ ] 日期字段声明格式和时区策略。
- [ ] 单字段复制只使用 `copy`；没有与旧 `display.copyable` 重复。
- [ ] 组合动作的字段和锚点存在。
- [ ] 同一列最多一个 `cell` 动作。
- [ ] `tests` 覆盖关键解析与标准化结果。
- [ ] `npm run verify:config` 通过。
- [ ] `npm run lint` 通过。
- [ ] `npm run build` 通过。
- [ ] 浏览器中验证单元格、已选行、筛选结果和组合复制。

验证命令：

```powershell
npm run verify:config
npm run lint
npm run build
```

## Python / Java 堆栈

新增契约 1.2 的可选堆栈解析，配置及行为见 [堆栈解析说明](stack-parsing.md)。旧配置继续使用单行模式，也可在界面中临时开启“解析堆栈”。
