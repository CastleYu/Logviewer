import { useEffect, useState } from 'react';
import { AiDefaults, AiMode, type AiConfig, type AiProbe } from '../config/aiTypes';
import type { ThemeMode } from '../types';
import { AiApi } from '../services/aiApi';
import { FloatingPanel } from './FloatingPanel';
import { Tooltip } from './Tooltip';

export function AiSettings({ theme, open, onClose, onSaved }: { theme: ThemeMode; open: boolean; onClose: () => void; onSaved: (config: AiConfig) => void }) {
  const [draft, setDraft] = useState<AiConfig>(AiDefaults.config());
  const [probe, setProbe] = useState<AiProbe | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const field = 'mt-1 h-8 w-full rounded-md border border-line bg-sunken px-2 text-xs text-ink outline-none';
  useEffect(() => {
    if (!open) return;
    let live = true;
    AiApi.state().then((state) => { if (live) setDraft(state.config); }).catch((cause) => { if (live) setError((cause as Error).message); });
    return () => { live = false; };
  }, [open]);
  const patch = (part: Partial<AiConfig>) => setDraft((value) => ({ ...value, ...part }));
  const save = async () => {
    setBusy(true);
    setError('');
    try { onSaved(await AiApi.saveConfig(draft)); } catch (cause) { setError((cause as Error).message); } finally { setBusy(false); }
  };
  const test = async () => {
    setBusy(true);
    setError('');
    setProbe(null);
    try { setProbe(await AiApi.probe(draft.command)); } catch (cause) { setProbe({ name: '', version: '', load: false, http: false, steering: false, auth: [], error: (cause as Error).message }); } finally { setBusy(false); }
  };
  const caps = probe && !probe.error ? `${probe.name} ${probe.version} · 可恢复会话 ${probe.load ? '是' : '否'} · MCP HTTP ${probe.http ? '是' : '否'}` : '';
  return <FloatingPanel theme={theme} title="AI 设置" open={open} onClose={onClose} width={520} height={560}>
    <div className="space-y-3 p-3">
      <label className="block text-xs font-semibold">Agent 名称<input aria-label="Agent 名称" value={draft.name} onChange={(event) => patch({ name: event.target.value })} className={field} /></label>
      <label className="block text-xs font-semibold">启动命令<input aria-label="启动命令" value={draft.command} onChange={(event) => patch({ command: event.target.value })} placeholder="opencode acp" className={field} /></label>
      <label className="block text-xs font-semibold">工作目录模式
        <select aria-label="工作目录模式" value={draft.mode} onChange={(event) => patch({ mode: event.target.value as AiMode })} className={field}>
          <option value={AiMode.Source}>源码工作区</option>
          <option value={AiMode.Isolated}>隔离日志工作区</option>
        </select>
      </label>
      <label className="block text-xs font-semibold">环境变量白名单<input aria-label="环境变量白名单" value={draft.envAllow.join(', ')} onChange={(event) => patch({ envAllow: event.target.value.split(',').map((item) => item.trim()).filter(Boolean) })} className={field} /></label>
      <label className="block text-xs font-semibold">终端恢复命令<input aria-label="终端恢复命令" value={draft.resume} onChange={(event) => patch({ resume: event.target.value })} className={field} /></label>
      <label className="block text-xs font-semibold">自动允许的类型<input aria-label="自动允许的类型" value={draft.allow.join(', ')} onChange={(event) => patch({ allow: event.target.value.split(',').map((item) => item.trim()).filter(Boolean) })} className={field} /></label>
      <label className="block text-xs font-semibold">自动拒绝的类型<input aria-label="自动拒绝的类型" value={draft.deny.join(', ')} onChange={(event) => patch({ deny: event.target.value.split(',').map((item) => item.trim()).filter(Boolean) })} className={field} /></label>
      <label className="flex items-center gap-2 text-xs"><input aria-label="安装诊断 Agent" type="checkbox" checked={draft.installRecipe} onChange={(event) => patch({ installRecipe: event.target.checked })} />把 RCA 诊断 Agent 安装到工作区的 .opencode/agents</label>
      <label className="flex items-center gap-2 text-xs"><input aria-label="在代码仓保存日志快照" type="checkbox" checked={draft.trackLog} onChange={(event) => patch({ trackLog: event.target.checked })} />在代码仓保存日志快照</label>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="lv-btn h-8 px-3" disabled={busy} onClick={() => void save()}>保存</button>
        <button type="button" className="lv-btn h-8 px-3" disabled={busy} onClick={() => void test()}>测试连接</button>
        {probe?.auth?.length ? <Tooltip text={probe.auth.map((item) => `${item.name} ${item.description}`).join(' · ')}><button type="button" className="lv-btn h-8 px-3" disabled={busy} onClick={() => void AiApi.login().catch((cause) => setError((cause as Error).message))}>在终端中登录</button></Tooltip> : null}
      </div>
      {probe ? <p role="status" className={`rounded-md border px-2 py-2 text-xs ${probe.error ? 'border-danger/40 text-danger' : 'border-line text-ink-2'}`}>{probe.error || caps}</p> : null}
      {error ? <p role="alert" className="text-xs text-danger">{error}</p> : null}
    </div>
  </FloatingPanel>;
}

export default AiSettings;
