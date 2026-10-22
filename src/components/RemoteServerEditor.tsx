import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Eye, EyeOff, FolderPlus, KeyRound, LoaderCircle, Plus, Search, Server, Trash2, X, XCircle } from 'lucide-react';
import { ProbeResult, RemoteProtocolKind, RemoteServerDraft, RemoteServerRecord } from '../config/fileLoadTypes';
import { RemoteFileApi } from '../services/remoteFileApi';
import { RemotePrefs } from '../utils/remotePrefs';

interface RemoteServerEditorProps {
  open: boolean;
  focusId?: string | null;
  onClose: () => void;
  onChanged: () => void;
  onBrowse: (server: RemoteServerRecord, start?: string) => void;
}

const sftpPort = 22;
const smbPort = 445;

function emptyDraft(): RemoteServerDraft {
  return { protocol: RemoteProtocolKind.Sftp, name: '', host: '', port: sftpPort, user: '', password: '', auth: 'password', keyPath: '', paths: [] };
}

function fromRecord(record: RemoteServerRecord): RemoteServerDraft {
  return {
    protocol: record.protocol, name: record.name === record.host ? '' : record.name, host: record.host, port: record.port, user: record.user,
    password: record.password, auth: record.auth || 'password', keyPath: record.keyPath || '',
    paths: record.paths.filter((item) => item !== '/'), domain: record.domain, share: record.share,
  };
}

/** 把 `user@host:port` 这类粘贴内容拆进对应字段。 */
function splitAddress(value: string): Partial<RemoteServerDraft> | null {
  const match = /^(?:(?:ssh|sftp):\/\/)?(?:([^@\s]+)@)?([^:\s/]+)(?::(\d{1,5}))?\/?$/.exec(value.trim());
  if (!match || (!match[1] && !match[3])) return null;
  return { user: match[1], host: match[2], port: match[3] ? Number(match[3]) : undefined };
}

/** 服务器管理：左侧列表，右侧表单；先测试再保存，保存后可直接浏览。 */
export const RemoteServerEditor: React.FC<RemoteServerEditorProps> = ({ open, focusId, onClose, onChanged, onBrowse }) => {
  const [servers, setServers] = useState<RemoteServerRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<RemoteServerDraft>(emptyDraft);
  const [query, setQuery] = useState('');
  const [reveal, setReveal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [probe, setProbe] = useState<ProbeResult | null>(null);
  const busy = loading || saving || testing;
  const smb = draft.protocol === RemoteProtocolKind.Smb;

  const select = (record: RemoteServerRecord | null) => {
    setSelectedId(record?.id || null);
    setDraft(record ? fromRecord(record) : emptyDraft());
    setError(null);
    setNotice(null);
    setProbe(null);
    setReveal(false);
  };

  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    RemoteFileApi.servers()
      .then((list) => {
        if (!active) return;
        setServers(list);
        const focus = list.find((item) => item.id === focusId);
        select(focus || (list.length === 0 ? null : focusId === null ? null : list[0]));
      })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : '无法读取已注册服务器'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [open, focusId]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape' && !saving) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, saving, onClose]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return needle ? servers.filter((item) => `${item.name} ${item.host} ${item.user}`.toLowerCase().includes(needle)) : servers;
  }, [servers, query]);

  if (!open) return null;

  const patch = (partial: Partial<RemoteServerDraft>) => {
    setDraft((current) => ({ ...current, ...partial }));
    setError(null);
    setNotice(null);
    setProbe(null);
  };
  const payload = (): RemoteServerDraft => ({ ...draft, paths: draft.paths.map((item) => item.trim()).filter(Boolean) });

  const save = async (browse: boolean) => {
    if (busy) return;
    if (!draft.host.trim() || !draft.user.trim()) { setError('请填写主机和用户名'); return; }
    setSaving(true);
    setError(null);
    try {
      const saved = selectedId ? await RemoteFileApi.updateServer(selectedId, payload()) : await RemoteFileApi.createServer(payload());
      const list = await RemoteFileApi.servers();
      setServers(list);
      select(list.find((item) => item.id === saved.id) || saved);
      setNotice(selectedId ? '已保存修改' : '已添加服务器');
      onChanged();
      if (browse) onBrowse(saved, probe?.home);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!selectedId || busy) return;
    if (!window.confirm(`删除服务器“${draft.name || draft.host}”？`)) return;
    setSaving(true);
    try {
      await RemoteFileApi.deleteServer(selectedId);
      RemotePrefs.forget(selectedId);
      const list = await RemoteFileApi.servers();
      setServers(list);
      select(list[0] || null);
      onChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '删除失败');
    } finally {
      setSaving(false);
    }
  };

  const test = async () => {
    if (busy) return;
    setTesting(true);
    setError(null);
    setNotice(null);
    try {
      setProbe(await RemoteFileApi.probeServer(payload()));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '测试连接失败');
    } finally {
      setTesting(false);
    }
  };

  const field = (label: string, node: React.ReactNode, wide = false) => (
    <label className={`block ${wide ? 'sm:col-span-2' : ''}`}><span className="lv-label">{label}</span>{node}</label>
  );

  return (
    <div role="presentation" className="fixed inset-0 z-[140] flex items-center justify-center bg-black/40 p-3 backdrop-blur-[2px]" onPointerDown={(event) => { if (event.target === event.currentTarget && !saving) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="server-manager-title" className="flex h-[min(640px,94vh)] w-full max-w-[880px] overflow-hidden rounded-2xl border border-line bg-surface text-ink shadow-[var(--shadow-window)]">
        <aside className="hidden w-60 shrink-0 flex-col border-r border-line bg-raised sm:flex">
          <div className="flex items-center justify-between px-3 pb-2 pt-3">
            <h2 id="server-manager-title" className="text-[13px] font-semibold">服务器</h2>
            <button type="button" className="lv-icon-btn" onClick={() => select(null)} disabled={busy} aria-label="新建服务器" title="新建服务器"><Plus className="h-4 w-4" /></button>
          </div>
          {servers.length > 5 ? (
            <div className="relative px-3 pb-2">
              <Search className="pointer-events-none absolute left-5 top-2 h-3.5 w-3.5 text-ink-3" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索" aria-label="搜索服务器" className="lv-input h-[28px] pl-7" />
            </div>
          ) : null}
          <ul className="min-h-0 flex-1 overflow-auto px-2 pb-2">
            {selectedId === null ? (
              <li className="mb-0.5 flex items-center gap-2 rounded-lg bg-accent-soft px-2.5 py-2 text-[12.5px] font-semibold text-accent-ink"><Plus className="h-3.5 w-3.5" />新服务器</li>
            ) : null}
            {filtered.map((item) => (
              <li key={item.id}>
                <button type="button" onClick={() => select(item)} disabled={busy} className={`mb-0.5 flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left ${selectedId === item.id ? 'bg-accent-soft' : 'hover:bg-sunken'}`}>
                  <Server className={`h-4 w-4 shrink-0 ${selectedId === item.id ? 'text-accent' : 'text-ink-3'}`} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px] font-semibold" title={item.name}>{item.name}</span>
                    <span className="block truncate font-mono text-[10.5px] text-ink-3" title={`${item.user}@${item.host}:${item.port}`}>{item.user}@{item.host}{item.port === (item.protocol === RemoteProtocolKind.Smb ? smbPort : sftpPort) ? '' : `:${item.port}`}</span>
                  </span>
                  {item.protocol === RemoteProtocolKind.Smb ? <span className="rounded bg-sunken px-1 text-[9.5px] font-semibold text-ink-3">SMB</span> : null}
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <form className="flex min-w-0 flex-1 flex-col" onSubmit={(event) => { event.preventDefault(); void save(false); }}>
          <header className="flex items-center gap-2 border-b border-line px-5 py-3">
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-[14px] font-semibold">{selectedId ? (draft.name || draft.host || '编辑服务器') : '添加服务器'}</h3>
              <p className="text-[11.5px] text-ink-3">凭据以明文保存在本机 .logviewer-remotes.json，只在本机后端使用</p>
            </div>
            <select aria-label="切换服务器" className="lv-input w-40 sm:hidden" value={selectedId || ''} onChange={(event) => select(servers.find((item) => item.id === event.target.value) || null)}>
              <option value="">+ 新服务器</option>
              {servers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
            <button type="button" className="lv-icon-btn" onClick={onClose} disabled={saving} aria-label="关闭"><X className="h-4 w-4" /></button>
          </header>

          <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
            {loading ? (
              <p className="flex items-center gap-2 text-[12px] text-ink-3"><LoaderCircle className="h-4 w-4 animate-spin" />正在读取…</p>
            ) : (
              <div className="grid grid-cols-1 gap-x-4 gap-y-3.5 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <span className="lv-label">协议</span>
                  <span className="lv-seg">
                    {[RemoteProtocolKind.Sftp, RemoteProtocolKind.Smb].map((protocol) => (
                      <button key={protocol} type="button" aria-pressed={draft.protocol === protocol} disabled={busy} onClick={() => patch({
                        protocol,
                        auth: protocol === RemoteProtocolKind.Smb ? 'password' : draft.auth,
                        port: protocol === RemoteProtocolKind.Smb ? (draft.port === sftpPort ? smbPort : draft.port) : (draft.port === smbPort ? sftpPort : draft.port),
                      })}>{protocol === RemoteProtocolKind.Sftp ? 'SFTP / SSH' : 'SMB 共享'}</button>
                    ))}
                  </span>
                </div>
                <div className="grid grid-cols-[minmax(0,1fr)_88px] gap-2 sm:col-span-2">
                  {field('主机', <input value={draft.host} disabled={busy} autoFocus={!selectedId} placeholder="10.0.0.12 或 user@host:2222"
                    onChange={(event) => patch({ host: event.target.value })}
                    onBlur={() => { const parts = splitAddress(draft.host); if (parts) patch({ host: parts.host || draft.host, user: parts.user || draft.user, port: parts.port || draft.port }); }}
                    className="lv-input font-mono" spellCheck={false} />)}
                  {field('端口', <input type="number" min={1} max={65535} value={draft.port} disabled={busy} onChange={(event) => patch({ port: Number(event.target.value) })} className="lv-input font-mono" />)}
                </div>
                {field('用户名', <input value={draft.user} disabled={busy} onChange={(event) => patch({ user: event.target.value })} className="lv-input font-mono" spellCheck={false} autoComplete="off" />)}
                {field('显示名称（可选）', <input value={draft.name} disabled={busy} onChange={(event) => patch({ name: event.target.value })} placeholder={draft.host || '默认使用主机地址'} className="lv-input" />)}
                {smb ? (
                  <>
                    {field('共享名', <input value={draft.share || ''} disabled={busy} onChange={(event) => patch({ share: event.target.value })} placeholder="logs" className="lv-input font-mono" />)}
                    {field('域（可空）', <input value={draft.domain || ''} disabled={busy} onChange={(event) => patch({ domain: event.target.value })} placeholder="WORKGROUP" className="lv-input font-mono" />)}
                  </>
                ) : (
                  <div className="sm:col-span-2">
                    <span className="lv-label">认证方式</span>
                    <span className="lv-seg">
                      <button type="button" aria-pressed={draft.auth !== 'key'} disabled={busy} onClick={() => patch({ auth: 'password' })}>密码</button>
                      <button type="button" aria-pressed={draft.auth === 'key'} disabled={busy} onClick={() => patch({ auth: 'key' })}><KeyRound className="mr-1 inline h-3 w-3" />私钥</button>
                    </span>
                  </div>
                )}
                {!smb && draft.auth === 'key'
                  ? field('私钥文件（本机路径）', <input value={draft.keyPath || ''} disabled={busy} onChange={(event) => patch({ keyPath: event.target.value })} placeholder="C:\Users\me\.ssh\id_ed25519" className="lv-input font-mono" spellCheck={false} />)
                  : null}
                {field(!smb && draft.auth === 'key' ? '私钥口令（没有可留空）' : '密码', (
                  <span className="relative block">
                    <input type={reveal ? 'text' : 'password'} value={draft.password} disabled={busy} onChange={(event) => patch({ password: event.target.value })} className="lv-input pr-9" autoComplete="new-password" />
                    <button type="button" className="lv-icon-btn absolute right-0.5 top-0.5 h-[26px] w-[26px]" onClick={() => setReveal((value) => !value)} aria-label={reveal ? '隐藏密码' : '显示密码'}>
                      {reveal ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </button>
                  </span>
                ))}
                <div className="sm:col-span-2">
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="lv-label mb-0">收藏目录</span>
                    <button type="button" onClick={() => patch({ paths: [...draft.paths, ''] })} disabled={busy} className="lv-btn lv-btn-ghost h-6 px-2 text-[11.5px] text-accent"><FolderPlus className="h-3.5 w-3.5" />添加</button>
                  </div>
                  {draft.paths.length === 0 ? <p className="text-[11.5px] text-ink-3">{smb ? '不填则从共享根目录开始。' : '不填则从登录用户的主目录开始。浏览时也可以随时收藏当前目录。'}</p> : null}
                  <div className="space-y-1.5">
                    {draft.paths.map((item, index) => (
                      <div key={index} className="flex items-center gap-1.5">
                        <input value={item} disabled={busy} onChange={(event) => patch({ paths: draft.paths.map((value, at) => (at === index ? event.target.value : value)) })} placeholder={smb ? '/app/logs（相对共享）' : '/var/log/myapp'} className="lv-input font-mono" />
                        <button type="button" onClick={() => patch({ paths: draft.paths.filter((_, at) => at !== index) })} disabled={busy} className="lv-icon-btn shrink-0" aria-label="删除该收藏"><Trash2 className="h-3.5 w-3.5" /></button>
                      </div>
                    ))}
                  </div>
                </div>
                {probe ? (
                  <div className={`rounded-lg border px-3 py-2.5 text-[12px] sm:col-span-2 ${probe.ok ? 'border-ok/30 bg-ok-soft' : 'border-danger/30 bg-danger-soft'}`}>
                    <p className={`flex items-center gap-1.5 font-semibold ${probe.ok ? 'text-ok' : 'text-danger'}`}>
                      {probe.ok ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}{probe.message}
                    </p>
                    {probe.home ? <p className="mt-1 text-ink-2">主目录 <code className="font-mono">{probe.home}</code></p> : null}
                    {probe.paths.map((item) => (
                      <p key={item.path} className={`mt-0.5 truncate font-mono text-[11px] ${item.ok ? 'text-ink-2' : 'text-danger'}`} title={item.path}>{item.ok ? '✓' : '✕'} {item.path} · {item.message}</p>
                    ))}
                  </div>
                ) : null}
                {error ? <p role="alert" className="text-[12px] text-danger sm:col-span-2">{error}</p> : null}
                {notice && !error ? <p className="text-[12px] text-ok sm:col-span-2">{notice}</p> : null}
              </div>
            )}
          </div>

          <footer className="flex flex-wrap items-center gap-2 border-t border-line px-5 py-3">
            {selectedId ? <button type="button" onClick={() => void remove()} disabled={busy} className="lv-btn lv-btn-ghost lv-btn-danger"><Trash2 className="h-3.5 w-3.5" />删除</button> : null}
            <span className="flex-1" />
            <button type="button" onClick={() => void test()} disabled={busy || !draft.host.trim()} className="lv-btn">
              {testing ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : null}测试连接
            </button>
            <button type="submit" disabled={busy} className="lv-btn">{selectedId ? '保存' : '添加'}</button>
            <button type="button" onClick={() => void save(true)} disabled={busy} className="lv-btn lv-btn-primary">
              {saving ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : null}{selectedId ? '保存并浏览' : '添加并浏览'}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
};
