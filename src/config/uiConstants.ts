/**
 * UI 层集中常量与枚举定义（遵循 G-2 关注点分离规范）。
 */

/** 本地持久化存储键 */
export enum UiStorageKey {
  StackParseEnabled = 'logviewer.stackParse.enabled',
  ErrorNavPos = 'logviewer.errorNav.pos',
  SourceAppPrefixes = 'logviewer.source.appPrefixes',
  SourceLibPrefixes = 'logviewer.source.libPrefixes',
}

/** 快捷键定义 */
export enum UiShortcutKey {
  StackRawToggle = 's',
  Escape = 'Escape',
  JumpLine = 'g',
  Enter = 'Enter',
}

/** 自定义 Tooltip 行为参数 */
export class TooltipConst {
  static readonly HoverDelayMs = 400;
  static readonly PaddingPx = 8;
  static readonly GapPx = 6;
  static readonly MaxWidthPx = 320;
  static readonly ZIndex = 360;
  static readonly CopyFeedbackMs = 1400;
  static readonly ExportCopyFeedbackMs = 1600;
}

/** 下拉/浮层菜单层叠常量 */
export class MenuLayerConst {
  static readonly ZIndex = 320;
  static readonly ViewportMarginPx = 8;
  static readonly GapPx = 4;
}

/** 日志级别规范化枚举（H2） */
export enum LevelToken {
  Trace = 'TRACE',
  Debug = 'DEBUG',
  Info = 'INFO',
  Warn = 'WARN',
  Error = 'ERROR',
  Fatal = 'FATAL',
  Failed = 'FAILED',
}

/** 日志级别视觉样式描述 */
export interface LevelVisual {
  readonly badgeClass: string;
  readonly rowBgClass: string;
}

/** H2 统一日志级别别名与样式映射 */
export class LevelPresentation {
  private static readonly AliasMap: Record<string, LevelToken> = {
    TRACE: LevelToken.Trace,
    DEBUG: LevelToken.Debug,
    INFO: LevelToken.Info,
    INFORMATION: LevelToken.Info,
    WARN: LevelToken.Warn,
    WARNING: LevelToken.Warn,
    ERROR: LevelToken.Error,
    ERR: LevelToken.Error,
    SEVERE: LevelToken.Error,
    FATAL: LevelToken.Fatal,
    CRITICAL: LevelToken.Fatal,
    CRIT: LevelToken.Fatal,
    PANIC: LevelToken.Fatal,
  };

  private static readonly VisualMap: Record<LevelToken, LevelVisual> = {
    [LevelToken.Trace]: {
      badgeClass: 'bg-[#eff2f6] text-[#526074] dark:bg-[#1f2530] dark:text-[#98a6bb]',
      rowBgClass: '',
    },
    [LevelToken.Debug]: {
      badgeClass: 'bg-[#eff2f6] text-[#526074] dark:bg-[#1f2530] dark:text-[#98a6bb]',
      rowBgClass: '',
    },
    [LevelToken.Info]: {
      badgeClass: 'bg-[#e8f1ff] text-[#225dc4] dark:bg-[#162744] dark:text-[#6ea8ff]',
      rowBgClass: '',
    },
    [LevelToken.Warn]: {
      badgeClass: 'bg-[#fff3dc] text-[#9b6200] dark:bg-[#33240d] dark:text-[#f2b34c]',
      rowBgClass: 'bg-[#fffdf2] dark:bg-[#221c0d]',
    },
    [LevelToken.Error]: {
      badgeClass: 'bg-[#ffebe9] text-[#b42318] dark:bg-[#38181b] dark:text-[#ff7b78]',
      rowBgClass: 'bg-[#fff5f5] dark:bg-[#2a1417]',
    },
    [LevelToken.Fatal]: {
      badgeClass: 'bg-[#ffdce0] text-[#8a1220] font-semibold dark:bg-[#49131c] dark:text-[#ff9ea8]',
      rowBgClass: 'bg-[#ffecef] dark:bg-[#36141a]',
    },
    [LevelToken.Failed]: {
      badgeClass: 'bg-[#f6eaec] text-[#9c3f4d] dark:bg-[#2a1b1f] dark:text-[#e0939e]',
      rowBgClass: 'bg-[#fdf7f8] dark:bg-[#1e1619]',
    },
  };

  /** 将原始级别文本归一为标准 LevelToken，未识别返回 null */
  static normalize(rawLevel: string): LevelToken | null {
    const key = rawLevel.trim().toUpperCase();
    return this.AliasMap[key] ?? null;
  }

  /** 获取日志条目的徽章与整行底色 class（无级别字段时不染行底色） */
  static resolve(rawLevel: string | undefined, success: boolean, hasLevelField: boolean): LevelVisual {
    if (!success) return this.VisualMap[LevelToken.Failed];
    if (!hasLevelField) return { badgeClass: this.VisualMap[LevelToken.Trace].badgeClass, rowBgClass: '' };
    const token = rawLevel ? this.normalize(rawLevel) : null;
    if (!token) return { badgeClass: this.VisualMap[LevelToken.Trace].badgeClass, rowBgClass: '' };
    return this.VisualMap[token];
  }

  /** 仅获取级别徽章样式 */
  static badge(rawLevel: string): string {
    const token = this.normalize(rawLevel);
    return token ? this.VisualMap[token].badgeClass : this.VisualMap[LevelToken.Trace].badgeClass;
  }
}

/** H2 格式色点调色板 */
export class FormatDotPalette {
  static readonly Colors = [
    '#3b82f6',
    '#10b981',
    '#f59e0b',
    '#8b5cf6',
    '#ec4899',
    '#06b6d4',
    '#6366f1',
    '#f97316',
  ] as const;

  static colorAt(index: number): string {
    return this.Colors[Math.abs(index) % this.Colors.length];
  }
}

/** M9 v3 堆栈标记类型 */
export enum StackMarkerKind {
  Exc = 'exc',
  Cause = 'cause',
  App = 'app',
  Lib = 'lib',
  Focus = 'focus',
}

/** M9 v3 堆栈解析与依赖识别常量 */
export class StackUiConst {
  static readonly FoldMinLibFrames = 2;

  /** Python 异常链分隔语句 */
  static readonly PythonSeparators = [
    'During handling of the above exception, another exception occurred:',
    'The above exception was the direct cause of the following exception:',
  ] as const;

  /** 内置依赖/标准库路径与包名前缀模式 */
  static readonly BuiltInLibPatterns: readonly { label: string; pattern: RegExp }[] = [
    { label: '命中 site-packages', pattern: /(?:^|[/\\])site-packages(?:[/\\]|$)/i },
    { label: '命中 dist-packages', pattern: /(?:^|[/\\])dist-packages(?:[/\\]|$)/i },
    { label: '命中 node_modules', pattern: /(?:^|[/\\])node_modules(?:[/\\]|$)/i },
    { label: '命中 .m2/repository', pattern: /(?:^|[/\\])\.m2[/\\]repository(?:[/\\]|$)/i },
    { label: '命中 Python 标准库', pattern: /(?:^\/usr\/lib\/python\d|\\Python\d+\\Lib\\|^<frozen\s|^<string>$)/i },
    { label: '命中 JDK 标准库 (java./javax./jdk./sun.)', pattern: /^(?:java|javax|jdk|sun|com\.sun)\./ },
    { label: '命中 Kotlin/Scala 标准库', pattern: /^(?:kotlin|kotlinx|scala)\./ },
    { label: '命中 Spring 框架', pattern: /^org\.springframework\./ },
    { label: '命中 Apache 依赖', pattern: /^org\.apache\./ },
    { label: '命中 Netty 依赖', pattern: /^io\.netty\./ },
    { label: '命中 PostgreSQL 驱动', pattern: /^org\.postgresql\./ },
    { label: '命中 HikariCP 连接池', pattern: /^com\.zaxxer\./ },
    { label: '命中日志/ORM 常见三方库', pattern: /^(?:ch\.qos\.logback|org\.slf4j|org\.hibernate|com\.fasterxml|jakarta|com\.google)\./ },
  ];

  /** 五种标记图例说明 */
  static readonly LegendItems: readonly { kind: StackMarkerKind; label: string; desc: string }[] = [
    { kind: StackMarkerKind.Exc, label: '最终抛出异常', desc: '整段堆栈最后抛出/触发的顶层异常' },
    { kind: StackMarkerKind.Cause, label: '原因异常', desc: 'Caused by / __cause__ / __context__ 引出的根因或前置异常' },
    { kind: StackMarkerKind.Focus, label: '建议关注帧', desc: '业务代码中最靠近抛出点的帧（支持 Ctrl+点击行首按钮）' },
    { kind: StackMarkerKind.App, label: '业务代码帧', desc: '命中绑定源码仓库或业务包前缀的栈帧' },
    { kind: StackMarkerKind.Lib, label: '依赖代码帧', desc: '命中三方库或标准库规则，连续多帧自动折叠' },
  ];
}

/** 统一复制/导出范围（T14） */
export enum CopyScope {
  Selected = 'selected',
  Filtered = 'filtered',
  All = 'all',
}

/** 首页与历史列表过滤常量 */
export class HomeConst {
  static readonly HeaderHistoryLimit = 10;
  static readonly DragFilesType = 'Files';
}

/** 浮动错误导航位置默认值（T15/T16） */
export class ErrorNavConst {
  static readonly DefaultOffsetRight = 16;
  static readonly DefaultOffsetBottom = 16;
  static readonly EdgePadding = 8;
}

/** 1-based 序号跳转解析结果 */
export type OrdinalJumpResult =
  | { ok: true; ordinal: number }
  | { ok: false; error: string };

/** 1-based 序号跳转校验器（搜索匹配与错误导航共用） */
export class OrdinalJump {
  static parse(raw: string, total: number): OrdinalJumpResult {
    const trimmed = raw.trim();
    if (!/^\d+$/.test(trimmed)) {
      return { ok: false, error: `请输入 1–${total.toLocaleString()} 的整数序号` };
    }
    const ordinal = Number.parseInt(trimmed, 10);
    if (!Number.isInteger(ordinal) || ordinal < 1 || ordinal > total) {
      return { ok: false, error: `序号超出范围（1–${total.toLocaleString()}）` };
    }
    return { ok: true, ordinal };
  }
}
