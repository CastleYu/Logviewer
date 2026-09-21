export class AiUi {
  static readonly PollMs = 800;
  static readonly ClockMs = 1000;
  static readonly Queue = '/queue';
  static readonly Resume = '/resume';
  static readonly Terminal = '/terminal';
  static readonly Refresh = '/refresh';
  static readonly Catalogs = '/catalogs';
  static readonly Labels: Record<string, string> = {
    accepted: '请求已接收，正在启动 Agent', busy: 'Agent 正在工作',
    retry: '服务正在重试', compacting: '正在压缩上下文，随后继续工作',
    compaction: '正在压缩上下文，随后继续工作', tool: '正在调用工具',
    permission: '等待权限确认', question: '等待你的回答',
    idle: '本轮已完成', error: '本轮遇到错误', aborted: '已停止',
  };
}
