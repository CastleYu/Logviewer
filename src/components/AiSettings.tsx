import React, { useEffect, useMemo, useState } from 'react';
import { FolderOpen, LoaderCircle, Save } from 'lucide-react';
import { AiMode, type AiConfig } from '../config/aiTypes';
import { ThemeMode } from '../types';
import { AiApi } from '../services/aiApi';
import { SourceApi } from '../services/sourceApi';
import FloatingPanel from './FloatingPanel';

type SettingsConfig = AiConfig & { mode?: AiMode; sourceRoot?: string; installRecipe?: boolean; trackLog?: boolean };
export interface AiSettingsProps {
  theme: ThemeMode;
  open: boolean;
  onClose: () => void;
  onSaved: (config: AiConfig) => void;
  initial: AiConfig;
  catalog: { providers: unknown; agents: unknown } | null;
  repository?: string;
  onBind?: (path: string) => Promise<void>;
}

function providersOf(value: unknown): Array<{ id: string; models?: Record<string, unknown> }> {
  const root = value as { all?: unknown; connected?: unknown } | undefined;
  const all = Array.isArray(root?.all) ? root.all : Array.isArray(value) ? value : [];
  const connected = new Set(Array.isArray(root?.connected) ? root.connected.map((item) => String((item as { id?: unknown })?.id || item)) : []);
  return all.map((item) => item as { id?: unknown; models?: Record<string, unknown> }).filter((item) => item.id && (!connected.size || connected.has(String(item.id)))).map((item) => ({ id: String(item.id), models: item.models }));
}

export const AiSettings: React.FC<AiSettingsProps> = ({ theme, open, onClose, onSaved, initial, catalog, repository, onBind }) => {
  const light = theme === 'light';
  const [draft, setDraft] = useState<SettingsConfig>({ mode: AiMode.Source, recipe: true, ...(initial as SettingsConfig) });
  const [roots, setRoots] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connection, setConnection] = useState('');
  const [sourceDirty, setSourceDirty] = useState(false);
  const providers = useMemo(() => providersOf(catalog?.providers), [catalog]);
  const agents = useMemo(() => { const value = catalog?.agents; return (Array.isArray(value) ? value : []).map((item) => String((item as { name?: unknown; id?: unknown })?.name || (item as { id?: unknown })?.id || '')).filter(Boolean); }, [catalog]);
  useEffect(() => { if (!open) return; setDraft({ mode: AiMode.Source, recipe: true, ...(initial as SettingsConfig), sourceRoot: '' }); setSourceDirty(false); setError(null); SourceApi.state().then((state) => setRoots(state.roots)).catch((cause) => setError(cause instanceof Error ? cause.message : '无法读取源码目录')); }, [initial, open]);
  const patch = (part: Partial<SettingsConfig>) => { setDraft((value) => ({ ...value, ...part })); if (Object.prototype.hasOwnProperty.call(part, 'sourceRoot')) setSourceDirty(true); setError(null); setConnection(''); };
  const pickRoot = async () => { setBusy(true); setError(null); try { const path = await SourceApi.pickFolder(); if (path) { const state = await SourceApi.addRoot(path); setRoots(state.roots); patch({ sourceRoot: path }); } } catch (cause) { setError(cause instanceof Error ? cause.message : '添加源码目录失败'); } finally { setBusy(false); } };
  const persisted = () => { const { sourceRoot: _sourceRoot, ...value } = draft; return value; };
  const save = async () => { setBusy(true); setError(null); try { if (!repository && sourceDirty && draft.sourceRoot && onBind) await onBind(draft.sourceRoot); const value = await AiApi.configure(persisted()); onSaved(value); onClose(); } catch (cause) { setError(cause instanceof Error ? cause.message : '保存 AI 设置失败'); } finally { setBusy(false); } };
  const connect = async () => {
    setBusy(true); setError(null); setConnection('');
    try {
      if (!repository && sourceDirty && draft.sourceRoot && onBind) await onBind(draft.sourceRoot);
      const value = await AiApi.configure(persisted());
      onSaved(value);
      const result = await AiApi.launch();
      setConnection(result.connection.managed ? '已启动并连接本地 server；关闭应用时自动回收。' : '已连接已有实例；关闭应用时保留该实例。');
    } catch (cause) { setError(cause instanceof Error ? cause.message : '连接失败'); }
    finally { setBusy(false); }
  };
  const field = `h-9 w-full rounded-md border px-2 text-xs outline-none focus:border-indigo-500 ${light ? 'border-slate-300 bg-white' : 'border-slate-700 bg-slate-950'}`;
  return <FloatingPanel theme={theme} title="AI 设置" open={open} onClose={onClose} width={540} height={600}>
    <form onSubmit={(event) => { event.preventDefault(); void save(); }} className="h-full space-y-3 overflow-auto p-4">
      <p className="text-xs text-slate-500">连接和工作区设置用于新会话；核心日志与源码诊断始终启用，下面的选项只控制附加报告格式。使用企业提供的内部 Agent 和模型。</p>
      {error ? <p role="alert" className="rounded-md bg-rose-50 px-2.5 py-2 text-xs text-rose-700">{error}</p> : null}
      <label className="block"><span className="mb-1 block text-xs font-semibold">已有实例 IP:端口（可空）</span><input aria-label="已有实例 IP:端口" value={draft.endpoint} onChange={(event) => patch({ endpoint: event.target.value })} placeholder="192.168.1.10:4096 或 %AGENT_HOST%:%AGENT_PORT%" className={field} /></label>
      <label className="block"><span className="mb-1 block text-xs font-semibold">回退启动程序（cmd / exe）</span><input aria-label="回退启动程序" value={draft.executable} onChange={(event) => patch({ executable: event.target.value })} placeholder="opencode.cmd 或 %AGENT_HOME%\opencode.cmd" className={field} /></label>
      <p className="text-xs text-slate-500">优先连接已有实例；地址未填或连接失败时自动启动此程序，并追加 serve 参数。支持 PATH 及 %变量名%、{'${变量名}'}、$env:变量名。</p>
      <div className="flex items-center gap-2"><button type="button" disabled={busy} onClick={() => void connect()} className="rounded-md border border-indigo-300 px-3 py-2 text-xs font-semibold text-indigo-700 disabled:opacity-40">{busy ? '正在连接…' : '测试连接与回退'}</button>{connection ? <p role="status" className="text-xs text-emerald-600">{connection}</p> : null}</div>
      <div className="grid grid-cols-2 gap-2"><label className="block"><span className="mb-1 block text-xs font-semibold">用户名</span><input aria-label="用户名" value={draft.username || ''} onChange={(event) => patch({ username: event.target.value })} className={field} /></label><label className="block"><span className="mb-1 block text-xs font-semibold">密码环境变量名</span><input aria-label="密码环境变量名" value={draft.passwordEnv || ''} onChange={(event) => patch({ passwordEnv: event.target.value })} placeholder="OPENCODE_SERVER_PASSWORD" className={field} /></label></div>
      <label className="block"><span className="mb-1 block text-xs font-semibold">工作区模式</span><select aria-label="工作区模式" value={draft.mode || AiMode.Source} onChange={(event) => patch({ mode: event.target.value as AiMode })} className={field}><option value={AiMode.Source}>源码工作区</option><option value={AiMode.Isolated}>隔离日志工作区</option></select></label>
      <label className="block"><span className="mb-1 block text-xs font-semibold">当前日志仓库</span><div className="flex gap-2"><input aria-label="当前日志仓库" list="ai-source-roots" readOnly={Boolean(repository)} value={repository || draft.sourceRoot || ''} onChange={(event) => patch({ sourceRoot: event.target.value })} placeholder="可选的绝对路径" className={`min-w-0 flex-1 ${field}`} /><button type="button" onClick={() => void pickRoot()} disabled={busy || Boolean(repository)} className="inline-flex shrink-0 items-center gap-1 rounded-md border border-indigo-300 px-2 text-[11px] font-semibold text-indigo-700 disabled:opacity-40"><FolderOpen className="h-3.5 w-3.5" />浏览并索引</button></div><p className="mt-1 text-[11px] text-slate-500">{repository ? '已绑定仓库；一个日志只绑定一个仓库。' : '选择目录后会明确绑定到当前日志。'}</p><datalist id="ai-source-roots">{roots.map((root) => <option key={root} value={root} />)}</datalist></label>
      <label className="flex items-start gap-2 text-xs"><input type="checkbox" checked={draft.recipe !== false} onChange={(event) => patch({ recipe: event.target.checked })} /><span>附加详细 RCA 报告结构</span></label><p className="text-[11px] text-slate-500">核心日志与源码诊断始终启用。</p>
      <label className="flex items-start gap-2 text-xs"><input type="checkbox" checked={Boolean(draft.installRecipe)} onChange={(event) => patch({ installRecipe: event.target.checked })} /><span>确认后安装 <code>.opencode/agents/logviewer-diagnose.md</code> 和 <code>logviewer-evidence.md</code></span></label>
      {draft.mode === AiMode.Source ? <label className="flex items-start gap-2 text-xs"><input type="checkbox" checked={Boolean(draft.trackLog)} onChange={(event) => patch({ trackLog: event.target.checked })} /><span>复制日志并 git add 此文件（不提交）</span></label> : null}
      <div className="grid grid-cols-2 gap-2"><label className="block"><span className="mb-1 block text-xs font-semibold">Provider ID</span><input aria-label="Provider ID" list="ai-providers" value={draft.providerID || ''} onChange={(event) => patch({ providerID: event.target.value })} className={field} /></label><label className="block"><span className="mb-1 block text-xs font-semibold">Model ID</span><input aria-label="Model ID" list="ai-models" value={draft.modelID || ''} onChange={(event) => patch({ modelID: event.target.value })} className={field} /></label></div>
      <datalist id="ai-providers">{providers.map((provider) => <option key={provider.id} value={provider.id} />)}</datalist><datalist id="ai-models">{providers.flatMap((provider) => Object.keys(provider.models || {}).map((model) => <option key={`${provider.id}:${model}`} value={model} />))}</datalist>
      <label className="block"><span className="mb-1 block text-xs font-semibold">Agent</span><input aria-label="Agent" list="ai-agents" value={draft.agent || ''} onChange={(event) => patch({ agent: event.target.value })} className={field} /></label><datalist id="ai-agents">{agents.map((agent) => <option key={agent} value={agent} />)}</datalist>
      <div className="flex justify-end pt-1"><button type="submit" disabled={busy} className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40">{busy ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}保存设置</button></div>
    </form>
  </FloatingPanel>;
};

export default AiSettings;
