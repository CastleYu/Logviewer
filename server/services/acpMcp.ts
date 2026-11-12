import http from 'node:http';
import { McpMethod, ToolCap, ToolName } from '../../src/config/aiTypes';
import { LogTools, type ToolOut } from './logTools';

export type McpBag = { name: string; lines: string[]; logs: import('../../src/types').LogEntry[] };
export type McpCtx = {
  bag: () => McpBag;
  view: () => import('../../src/config/aiTypes').AiView;
  notes: import('./noteStore').NoteStore;
  logId: string;
  onTool: (name: string, out: ToolOut) => void;
  onNote: (note: import('../../src/config/aiTypes').AiNote) => void;
};

class McpSchema {
  static prop(type: string, extra: Record<string, unknown> = {}): Record<string, unknown> { return { type, ...extra }; }
  static tool(name: string, description: string, properties: Record<string, unknown>, required: string[] = []): Record<string, unknown> {
    return { name, description, inputSchema: { type: 'object', properties, required, additionalProperties: false } };
  }
  static list(): Record<string, unknown>[] {
    const s = McpSchema.prop;
    return [
      McpSchema.tool(ToolName.Overview, '日志概览：文件名、记录数、时间范围、级别、前 10 个模块、解析失败数。返回不超过 1KB。', {}),
      McpSchema.tool(ToolName.Search, '搜索日志。命中返回源行号 L1234 和单行摘要。', { query: s('string'), regex: s('boolean'), level: s('string'), module: s('string'), from: s('string'), to: s('string'), limit: s('integer'), cursor: s('string') }, ['query']),
      McpSchema.tool(ToolName.Read, '读取源行附近原文。before≤20，after≤50，超过 8KB 会截断。', { line: s('integer'), before: s('integer'), after: s('integer') }, ['line']),
      McpSchema.tool(ToolName.Record, '读取单条记录的字段和堆栈。', { line: s('integer') }, ['line']),
      McpSchema.tool(ToolName.Stats, '分组计数，最多 50 组。', { groupBy: s('string', { enum: ['level', 'module', 'thread', 'minute'] }), filter: s('string') }, ['groupBy']),
      McpSchema.tool(ToolName.Errors, 'ERROR / FATAL / 解析失败摘要，按异常类型去重。', { limit: s('integer'), cursor: s('string') }),
      McpSchema.tool(ToolName.Selection, '用户当前选中的行。', {}),
      McpSchema.tool(ToolName.View, '用户当前筛选、搜索词和可见范围。', {}),
      McpSchema.tool(ToolName.NoteWrite, '写入当前日志的调查笔记。这是允许的写入方式。', { name: s('string'), text: s('string') }, ['text']),
      McpSchema.tool(ToolName.NoteRead, '按 id 读取笔记。', { id: s('string') }, ['id']),
      McpSchema.tool(ToolName.NoteList, '列出当前日志的笔记。', {}),
      McpSchema.tool(ToolName.MemoryWrite, '写入跨日志长期记忆。', { name: s('string'), text: s('string'), tags: s('array') }, ['text']),
      McpSchema.tool(ToolName.MemorySearch, '按关键词或标签检索记忆。', { query: s('string'), tag: s('string') }),
      McpSchema.tool(ToolName.ReportWrite, '写入 RCA 报告。', { name: s('string'), text: s('string') }, ['text']),
    ];
  }
}

export class AcpMcp {
  private server: http.Server | null = null;
  readonly tokens = new Map<string, McpCtx>();
  port = 0;

  async start(): Promise<void> {
    if (this.server) return;
    const server = http.createServer((req, res) => { void this.handle(req, res); });
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => resolve());
    });
    const address = server.address();
    this.port = address && typeof address === 'object' ? address.port : 0;
    this.server = server;
  }

  url(token: string): string { return `http://127.0.0.1:${this.port}/mcp/${token}`; }

  async stop(): Promise<void> {
    const server = this.server;
    this.server = null;
    if (!server) return;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  private async handle(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const url = new URL(req.url || '/', 'http://127.0.0.1');
    const token = url.pathname.split('/').filter(Boolean)[1] || '';
    const ctx = this.tokens.get(token);
    if (!ctx) { res.writeHead(404).end('missing'); return; }
    if (req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
      const timer = setInterval(() => res.write(': ping\n\n'), 15000);
      req.on('close', () => clearInterval(timer));
      return;
    }
    if (req.method === 'DELETE') { res.writeHead(200).end(); return; }
    if (req.method !== 'POST') { res.writeHead(405).end(); return; }
    const raw = await AcpMcp.body(req);
    let msg: Record<string, unknown> = {};
    try { msg = raw ? JSON.parse(raw) as Record<string, unknown> : {}; } catch { res.writeHead(400).end('bad json'); return; }
    const method = String(msg.method || '');
    const id = msg.id;
    if (id === undefined) { res.writeHead(202).end(); return; }
    try {
      const result = await this.dispatch(ctx, method, (msg.params || {}) as Record<string, unknown>);
      AcpMcp.send(req, res, { jsonrpc: '2.0', id, result });
    } catch (error) {
      AcpMcp.send(req, res, { jsonrpc: '2.0', id, error: { code: -32603, message: error instanceof Error ? error.message : 'mcp error' } });
    }
  }

  private async dispatch(ctx: McpCtx, method: string, params: Record<string, unknown>): Promise<unknown> {
    if (method === McpMethod.Initialize) {
      const version = String(params.protocolVersion || '2025-03-26');
      return { protocolVersion: version, capabilities: { tools: { listChanged: false } }, serverInfo: { name: 'logtools', version: '1' } };
    }
    if (method === McpMethod.List) return { tools: McpSchema.list() };
    if (method === McpMethod.Ping) return {};
    if (method === McpMethod.Initialized) return {};
    if (method === McpMethod.Call) return this.call(ctx, params);
    throw new Error(`不支持的 MCP 方法 ${method}`);
  }

  private async call(ctx: McpCtx, params: Record<string, unknown>): Promise<unknown> {
    const name = String(params.name || '');
    const args = (params.arguments || {}) as Record<string, unknown>;
    const tools = new LogTools(ctx.bag(), ctx.view(), ctx.notes, ctx.logId, ctx.onNote);
    const out = await tools.resolve(name, args, tools.call(name, args));
    if (out.bytes > ToolCap.Body) throw new Error(`工具返回超过 ${ToolCap.Body} 字节`);
    ctx.onTool(name, out);
    process.stdout.write(`[acp] tool ${name} bytes=${out.bytes} truncated=${out.truncated}\n`);
    return { content: [{ type: 'text', text: out.text }], isError: out.text.includes('"error"') };
  }

  private static body(req: http.IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      req.on('error', reject);
    });
  }

  private static send(req: http.IncomingMessage, res: http.ServerResponse, payload: unknown): void {
    const accept = String(req.headers.accept || '');
    const json = JSON.stringify(payload);
    if (accept.includes('text/event-stream') && !accept.includes('application/json')) {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store' });
      res.end(`event: message\ndata: ${json}\n\n`);
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(json);
  }
}
