import fs from 'node:fs/promises';
import path from 'node:path';
import { AiService } from '../server/services/aiService';
import { HistoryStore } from '../server/services/historyStore';
import { HistoryKind } from '../src/config/historyTypes';
import { BuiltinFormatId } from '../src/config/logFormatTypes';
import { AiMode, AiPartKind, AiPermitState, AiSessionState, ToolName, type AiMsg, type AiPart, type AiSession } from '../src/config/aiTypes';
import { generateSampleLogsText } from '../src/utils/sampleData';

class VerifyAcp {
  static fail(message: string): never { throw new Error(message); }

  static hide(text: string): string {
    const secret = process.env.OPENCODE_GO_API_KEY || '';
    return secret ? text.split(secret).join('[redacted]') : text;
  }

  static say(text: string): void { console.log(VerifyAcp.hide(text)); }

  static async session(service: AiService, id: string): Promise<AiSession> {
    const found = (await service.state()).sessions.find((item) => item.id === id);
    if (!found) VerifyAcp.fail('会话丢失');
    return found;
  }

  static async until(service: AiService, id: string, label: string, ok: (session: AiSession) => boolean, ms: number): Promise<AiSession> {
    const start = Date.now();
    let last = await VerifyAcp.session(service, id);
    while (Date.now() - start < ms) {
      if (ok(last)) return last;
      if (last.state === AiSessionState.Error) VerifyAcp.fail(`${label}: ${last.error || 'error'}`);
      await new Promise((resolve) => setTimeout(resolve, 500));
      last = await VerifyAcp.session(service, id);
    }
    VerifyAcp.fail(`${label} 超时，state=${last.state} calls=${last.calls.join(',')}`);
  }

  static text(session: AiSession): string {
    return session.messages.filter((msg) => !msg.system).flatMap((msg) => msg.parts).map((part) => part.t === AiPartKind.Text || part.t === AiPartKind.User ? part.text : '').join('\n');
  }

  static firstAgent(session: AiSession): AiMsg | undefined {
    const firstUser = session.messages.findIndex((msg) => msg.role === 'user');
    return session.messages.slice(firstUser + 1).find((msg) => msg.role === 'agent');
  }

  static toolsOf(msg?: AiMsg): Extract<AiPart, { t: AiPartKind.Tool }>[] {
    const unique = new Map<string, Extract<AiPart, { t: AiPartKind.Tool }>>();
    for (const part of msg?.parts || []) if (part.t === AiPartKind.Tool) unique.set(part.id, part);
    return [...unique.values()];
  }

  static answerOf(msg?: AiMsg): string {
    return (msg?.parts || []).filter((part): part is Extract<AiPart, { t: AiPartKind.Text }> => part.t === AiPartKind.Text).map((part) => part.text).join('\n').trim();
  }

  static isShell(part: Extract<AiPart, { t: AiPartKind.Tool }>): boolean {
    const name = (part.name || '').toLowerCase();
    const args = (part.args || '').toLowerCase();
    if (/(^|[^a-z])(shell|bash|powershell|pwsh|cmd|git)([^a-z]|$)/.test(name)) return true;
    if (/(^|\s)(command|cmd)=["']?(git|shell|bash|powershell|pwsh|cmd)\b/.test(args)) return true;
    return /tools(?:\.logtools)?\.(bash|shell|exec|spawn)\s*\(/.test(args);
  }

  static async main(): Promise<void> {
    const root = path.join(process.cwd(), 'Temp', 'acp-verify');
    await fs.rm(root, { recursive: true, force: true });
    const history = new HistoryStore(path.join(root, 'history'));
    const dir = path.join(root, 'ai');
    const service = new AiService(dir, history);
    const sample = generateSampleLogsText(50_000);
    const log = await history.save({ name: 'sample-50k.log', origin: 'sample', kind: HistoryKind.Sample, formatId: BuiltinFormatId.LegacyStandard }, sample);

    const probe = await service.probe();
    if (probe.error || !probe.load) VerifyAcp.fail(probe.error || '缺少 loadSession');
    VerifyAcp.say(`1 initialize ${probe.name} ${probe.version} loadSession=${probe.load} http=${probe.http}`);

    let session = await service.create({ logId: log.id, mode: AiMode.Isolated, installRecipe: false });
    const option = session.options.find((item) => item.id === 'model');
    const preferred = 'opencode-go/deepseek-v4.1-flash';
    if (option?.options.some((item) => item.value === preferred) && session.model !== preferred) session = await service.option(session.id, 'model', preferred);
    if (!session.model?.startsWith('opencode-go/')) VerifyAcp.fail(`模型不是 OpenCode Go: ${session.model || ''}`);
    VerifyAcp.say(`2 session ${session.agentId} model=${session.model}`);

    const first = '分析这份日志里最主要的错误';
    const second = '再用一句话说明这些错误集中在哪些模块';
    const started = Date.now();
    let boom = '';
    void service.prompt({ sessionId: session.id, text: first }).catch((error: Error) => { boom = error.message; });
    await VerifyAcp.until(service, session.id, '第一轮开始', (item) => item.state === AiSessionState.Busy, 60_000);
    if (boom) VerifyAcp.fail(boom);
    const callsBefore = session.calls.length;
    const queued = await service.prompt({ sessionId: session.id, text: second });
    if (!queued.queue.some((item) => item.text === second)) VerifyAcp.fail('第二条没有进入队列');
    VerifyAcp.say('4 第二条已进入队列');

    const firstTurn = await VerifyAcp.until(service, session.id, '第一轮回答', (item) => {
      const agent = VerifyAcp.firstAgent(item);
      return !!agent && agent.done === true;
    }, 600_000);
    const agent = VerifyAcp.firstAgent(firstTurn);
    const answer = VerifyAcp.answerOf(agent);
    const tools = VerifyAcp.toolsOf(agent);
    const shells = tools.filter((part) => VerifyAcp.isShell(part));
    const mcp = firstTurn.calls.length - callsBefore;
    const elapsed = Date.now() - started;
    if (!answer) VerifyAcp.fail(`第一轮没有正文回答，工具=${tools.map((part) => part.name).join(',')}`);
    if (!/\bL\d+/.test(answer)) VerifyAcp.fail(`第一轮回答缺少 L 行号: ${answer.slice(0, 200)}`);
    if (tools.length > 15) VerifyAcp.fail(`第一轮工具调用 ${tools.length} 次，超过 15: ${tools.map((part) => part.name).join(',')}`);
    if (shells.length) VerifyAcp.fail(`第一轮出现 shell 调用: ${shells.map((part) => part.name).join(',')}`);
    const names = tools.map((part) => part.name);
    if (!names.includes(ToolName.Overview) || !names.includes(ToolName.Errors)) VerifyAcp.fail(`未调用概览和错误工具: ${names.join(',')}`);
    VerifyAcp.say(`3 第一轮正文 calls=${tools.length} mcp=${mcp} ${elapsed}ms shell=0，含 L 行号`);

    session = await VerifyAcp.until(service, session.id, '两轮完成', (item) => item.state === AiSessionState.Idle && !item.queue.length && item.messages.filter((msg) => msg.role === 'user').some((msg) => msg.parts.some((part) => part.t === AiPartKind.User && part.text === second)), 420_000);
    if (!/\bL\d+/.test(VerifyAcp.text(session))) VerifyAcp.fail('回答缺少 L 行号');

    const ask = '请把结论写进 README.md。必须先尝试直接写工作目录里的 README.md。被拒绝后调用 note_write，笔记名用 verify-note，正文写这次结论。';
    await service.prompt({ sessionId: session.id, text: ask });
    session = await VerifyAcp.until(service, session.id, '写文件请求', (item) => item.state === AiSessionState.Idle && item.permits.some((permit) => permit.state === AiPermitState.Deny), 300_000);
    if (!session.calls.includes(ToolName.NoteWrite)) {
      await service.prompt({ sessionId: session.id, text: '直接写文件已被拒绝。现在改用 note_write，笔记名 verify-note，正文写这次结论。不要再次尝试写文件。' });
      session = await VerifyAcp.until(service, session.id, '笔记', (item) => item.state === AiSessionState.Idle && item.calls.includes(ToolName.NoteWrite), 300_000);
    }
    const denied = session.permits.some((item) => item.state === AiPermitState.Deny) || session.messages.some((msg) => msg.parts.some((part) => part.t === AiPartKind.Deny));
    if (!denied) VerifyAcp.fail('没有拒绝直接写文件');
    const notes = await service.notesOf(log.id);
    if (!notes.some((item) => item.text.trim())) VerifyAcp.fail('笔记未落盘');
    VerifyAcp.say(`5 写文件被拒绝，note_write 已落盘 ${notes.length} 条`);

    await service.view(session.id, { selected: [6, 76, 88], use: true });
    await service.prompt({ sessionId: session.id, text: '请先用 log_selection 读取当前选中的 3 行，再说明这三行分别是什么问题。' });
    session = await VerifyAcp.until(service, session.id, '选中行', (item) => item.state === AiSessionState.Idle && item.calls.includes(ToolName.Selection), 300_000);
    VerifyAcp.say('4b log_selection 读取 3 行');

    const before = session.messages.length;
    const agentId = session.agentId || '';
    await service.close();
    const next = new AiService(dir, history);
    let restored = await next.refresh(session.id);
    if (restored.messages.length !== before) VerifyAcp.fail(`恢复后消息 ${restored.messages.length} 条，之前 ${before} 条`);
    const injected = restored.messages.find((msg) => msg.role === 'user' && msg.system);
    if (!injected) VerifyAcp.fail('初始系统提示未标记为 system');
    if (!injected.display?.includes(first)) VerifyAcp.fail(`system 消息没有保留用户问题: ${injected.display || ''}`);
    const heads = ['你是 LogViewer 的日志诊断助手', '你是 LogViewer 里的诊断助手'];
    const leak = restored.messages.some((msg) => !msg.system && msg.role === 'user' && msg.parts.some((part) => part.t === AiPartKind.User && heads.some((head) => part.text.includes(head))));
    if (leak) VerifyAcp.fail('系统提示仍作为用户消息显示');
    VerifyAcp.say('6b 系统提示已标记为 system，用户气泡只显示问题');
    await next.prompt({ sessionId: session.id, text: '继续：用一句话复述最主要的错误' });
    restored = await VerifyAcp.until(next, session.id, '恢复后继续', (item) => item.state === AiSessionState.Idle && item.messages.length > before, 240_000);
    VerifyAcp.say(`6 session/load 恢复 ${before} 条并继续对话`);

    const command = next.cli(session.id);
    if (!agentId || !command.includes(agentId)) VerifyAcp.fail('CLI 命令没有同一个 sessionId');
    VerifyAcp.say(`7 ${command}`);
    VerifyAcp.say(`8 tokens in=${restored.usage.input} out=${restored.usage.output} total=${restored.usage.total}`);
    for (const size of restored.toolSizes) VerifyAcp.say(`8 tool ${size.name} bytes=${size.bytes} truncated=${size.truncated}`);
    if (restored.toolSizes.some((item) => item.name !== ToolName.Overview && item.bytes > 8192) || restored.toolSizes.some((item) => item.name === ToolName.Overview && item.bytes > 1024)) VerifyAcp.fail('工具返回超过上限');
    await next.close();
    VerifyAcp.say('verify:acp ok');
  }
}

VerifyAcp.main().catch((error: unknown) => {
  console.error(VerifyAcp.hide(error instanceof Error ? error.message : 'verify:acp failed'));
  process.exit(1);
});
