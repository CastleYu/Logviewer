# LogViewer 日志格式配置指南

LogViewer 通过 `public/logviewer.config.json` 加载外部日志格式。配置遵循 `public/logviewer.config.schema.json`，适合开发者手写，也适合 Agent 生成和修改。

内置的“标准十字段（兼容现版本）”始终是格式选择器的第一个选项。它继续使用原解析器、原表格和原筛选流程，不会被外部配置覆盖。外部格式从第二项开始排列。

## 最短配置流程

1. 复制 `public/logviewer.config.json` 中的 JSON Lines 格式。
2. 修改格式的 `id`、`name` 和 `parsers`。
3. 为每个解析结果声明一个 `fields` 条目。
4. 为每个字段明确指定 `filter.kind`；不需要筛选时使用 `none`。
5. 添加至少一条 `tests` 样例。
6. 执行：

```powershell
npm run verify:config
npm run lint
npm run build
```

刷新页面后，新格式会出现在顶栏格式选择器中。切换格式时，当前文件会自动使用新格式重新解析。

## 顶层字段

| 字段 | 必需 | 说明 |
|---|---:|---|
| `$schema` | 否 | 指向 JSON Schema，建议保留 |
| `contractVersion` | 是 | 当前必须为 `1.0` |
| `defaultFormat` | 否 | 默认外部格式 ID；省略或无效时使用内置格式 |
| `formats` | 是 | 外部格式数组 |

外部格式不能使用保留 ID `builtin-standard-bracket-v1`。

## 格式选择和失败行为

格式选择目前由用户在顶栏明确完成。`match.filePatterns`、`match.probe` 和 `match.priority` 已进入契约，供后续自动识别使用；当前版本不会在用户选择之后再次猜测格式。

每个格式可以设置：

```json
{
  "onParseFailure": {
    "action": "reject",
    "messageField": "message"
  }
}
```

- `reject`：该行显示为解析失败。
- `emit-unparsed`：保留该行，将原文写入 `messageField`，适合混合堆栈日志。

## 解析器

`parsers` 按数组顺序执行，第一个成功且满足必填字段的解析器胜出。

### bracketed

用于 `[字段1][字段2]`，支持字段内部嵌套括号：

```json
{
  "id": "nested",
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

### anchored-bracketed

适合中间消息可能包含未闭合括号的日志。运行时先读取 `head`，再从右侧读取 `tail`，剩余内容写入 `body`：

```json
{
  "id": "anchored",
  "kind": "anchored-bracketed",
  "open": "[",
  "close": "]",
  "head": ["timestamp", "level", "requestId"],
  "body": "message",
  "tail": ["module", "fileName", "sourceLine"]
}
```

### regex

字段 ID 必须使用 JavaScript 具名捕获组：

```json
{
  "id": "plain-text",
  "kind": "regex",
  "pattern": "^(?<timestamp>\\S+)\\s+(?<level>\\w+)\\s+(?<message>.*)$",
  "flags": "i"
}
```

`flags` 只允许 `i`、`m`、`s`、`u`。不要使用 `g`，每条记录只解析一次。

### json

每行必须是一个 JSON 对象。绑定路径支持 `$.a.b` 和数字数组索引 `$.items[0].id`：

```json
{
  "id": "json-line",
  "kind": "json",
  "bindings": {
    "timestamp": "$.time",
    "message": "$.event.message",
    "requestId": "$.context.requestId"
  }
}
```

当前只支持逐行记录，即 `record.mode` 必须为 `line`。

## 字段

字段 ID 是稳定机器键，`label` 是界面名称，`role` 是 LogViewer 的系统语义：

```json
{
  "id": "severityCode",
  "label": "严重程度",
  "role": "level",
  "type": "enum",
  "filter": {
    "kind": "select",
    "selection": "multiple",
    "options": ["INFO", "WARN", "ERROR"]
  }
}
```

同一格式中 `id` 不能重复，`role` 也不能重复。

支持的角色：

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

角色不是必需字段。没有角色的字段仍会作为普通列显示、搜索、筛选和导出。

支持的类型：`string`、`integer`、`number`、`boolean`、`datetime`、`enum`、`json`。

`datetime` 当前接受以下运行时形式：

- `YYYY-MM-DD HH:mm:ss,SSS`
- `YYYY-MM-DD HH:mm:ss.SSS`
- `YYYY-MM-DDTHH:mm:ss.SSSZ`
- 带 `+08:00` 等 ISO-8601 偏移的时间

`datetime.formats` 必须非空，用于声明和文档化来源格式。实际值仍会经过严格日期合法性检查。

## 标准化

标准化发生在类型转换之前，按数组顺序执行：

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

支持：`trim`、`uppercase`、`lowercase`、`map`。

## 显示设置

```json
{
  "display": {
    "visible": true,
    "width": 160,
    "grow": false,
    "align": "left",
    "copyable": false
  }
}
```

- `visible: false`：不显示该列，但字段仍可用于语义映射和导出。
- `width`：初始列宽，最小值 48。
- `grow`：占用剩余表格宽度，通常只给消息字段。
- `align`：`left`、`center`、`right`。

## 筛选方案

每个字段必须显式设置一种筛选方案。

| `filter.kind` | 可用字段类型 | 行为 |
|---|---|---|
| `none` | 任意 | 不显示筛选入口 |
| `text` | `string`、`json` | 包含、大小写、可选正则 |
| `number-range` | `integer`、`number` | 最小值和最大值，可配置边界是否包含 |
| `datetime-range` | `datetime` | 起止时间、包含边界、可选输入时区 |
| `select` | `string`、`enum`、`boolean` | 单选或多选；多选内部使用 OR |

不同字段之间始终使用 AND。

### 文本筛选

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

### 单选或多选

固定选项：

```json
{
  "kind": "select",
  "selection": "multiple",
  "searchable": false,
  "options": ["DEBUG", "INFO", "WARN", "ERROR"],
  "combine": "or"
}
```

从日志数据生成选项：

```json
{
  "kind": "select",
  "selection": "single",
  "searchable": true,
  "optionsSource": "distinct-values"
}
```

## 契约测试

每个格式建议至少包含一条成功样例和一条边界样例：

```json
{
  "tests": [
    {
      "name": "警告日志",
      "input": "...一整行原始日志...",
      "expect": {
        "parser": "json-line",
        "fields": {
          "level": "WARN",
          "requestId": "REQ-42"
        }
      }
    }
  ]
}
```

页面加载配置时会执行这些测试。某个格式测试失败时，只禁用该格式，内置格式和其他有效格式继续可用。顶栏格式选择器旁会显示错误数量。

## Agent 修改规范

Agent 修改配置时应遵循以下固定流程：

1. 先读取本指南和 `public/logviewer.config.schema.json`。
2. 不修改或复制保留 ID `builtin-standard-bracket-v1`。
3. 创建新的唯一格式 ID，不按字段名称猜测类型或筛选器。
4. 解析器中的每个绑定必须指向 `fields` 中存在的 ID。
5. 每个字段明确声明 `type` 和 `filter.kind`。
6. 每个语义角色在一个格式中最多出现一次。
7. 添加来自用户真实格式的脱敏 `tests`。
8. 运行契约验收、TypeScript 检查和生产构建。
9. 只有三项均通过才报告配置可用。

稳定错误码包括：

- `CFG_VERSION_UNSUPPORTED`
- `CFG_FORMAT_ID_DUPLICATE`
- `CFG_FIELD_ID_DUPLICATE`
- `CFG_ROLE_DUPLICATE`
- `CFG_PARSER_BINDING_UNKNOWN`
- `CFG_FILTER_TYPE_MISMATCH`
- `CFG_DATETIME_FORMAT_MISSING`
- `CFG_TEST_FAILED`

Agent 应根据错误码修改对应配置，不应绕过校验或删除失败测试。
