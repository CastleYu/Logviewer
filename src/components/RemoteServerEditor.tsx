import React, { useEffect, useState } from 'react';
import { ArrowLeft, Eye, EyeOff, FolderPlus, LoaderCircle, Plus, Server, Trash2 } from 'lucide-react';
import { ProbeResult, RemoteServerDraft, RemoteServerRecord } from '../config/fileLoadTypes';
import { ThemeMode } from '../types';
import { RemoteFileApi } from '../services/remoteFileApi';

interface RemoteServerEditorProps {
  theme: ThemeMode;
  disabled?: boolean;
  onBack: () => void;
  onChanged: () => void;
  onBrowse?: (server: RemoteServerRecord) => void;
}

function emptyDraft(): RemoteServerDraft {
  return {
    protocol: 'sftp',
    name: '',
    host: '',
    port: 22,
    user: '',
    password: '',
    paths: [''],
  };
}

function fromRecord(record: RemoteServerRecord): RemoteServerDraft {
  return {
    protocol: record.protocol,
    name: record.name,
    host: record.host,
    port: record.port,
    user: record.user,
    password: record.password,
    paths: record.paths.length > 0 ? [...record.paths] : [''],
    domain: record.domain,
    share: record.share,
  };
}

export const RemoteServerEditor: React.FC<RemoteServerEditorProps> = ({ theme, disabled, onBack, onChanged, onBrowse }) => {
  const light = theme === 'light';
  const [servers, setServers] = useState<RemoteServerRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<RemoteServerDraft>(emptyDraft);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [probe, setProbe] = useState<ProbeResult | null>(null);
  const busy = Boolean(disabled) || loading || saving;

  const field = `h-10 w-full rounded-lg border px-3 text-sm outline-none focus:border-indigo-500 ${light ? 'bg-white border-slate-300' : 'bg-slate-950 border-slate-700'}`;

  const refresh = async (keepId: string | null) => {
    const list = await RemoteFileApi.servers();
    setServers(list);
    if (keepId && list.some((item) => item.id === keepId)) {
      const current = list.find((item) => item.id === keepId);
      if (current) {
        setSelectedId(current.id);
        setDraft(fromRecord(current));
      }
      return;
    }
    setSelectedId(null);
    setDraft(emptyDraft());
  };

  useEffect(() => {
    let active = true;
    RemoteFileApi.servers()
      .then((list) => {
        if (!active) return;
        setServers(list);
      })
      .catch((cause) => {
        if (!active) return;
        setError(cause instanceof Error ? cause.message : '无法读取已注册服务器');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  const patch = (partial: Partial<RemoteServerDraft>) => {
    setDraft((current) => ({ ...current, ...partial }));
    setMessage(null);
    setError(null);
    setProbe(null);
  };

  const setPath = (index: number, value: string) => {
    const paths = [...draft.paths];
    paths[index] = value;
    patch({ paths });
  };

  const addPath = () => patch({ paths: [...draft.paths, ''] });
  const removePath = (index: number) => {
    const paths = draft.paths.filter((_, itemIndex) => itemIndex !== index);
    patch({ paths: paths.length > 0 ? paths : [''] });
  };

  const selectNew = () => {
    setSelectedId(null);
    setDraft(emptyDraft());
    setMessage(null);
    setError(null);
    setProbe(null);
    setShowPassword(false);
  };

  const selectServer = (record: RemoteServerRecord) => {
    setSelectedId(record.id);
    setDraft(fromRecord(record));
    setMessage(null);
    setError(null);
    setProbe(null);
    setShowPassword(false);
  };

  const save = async (browse = false) => {
    if (busy) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const payload = { ...draft, paths: draft.paths.map((item) => item.trim()).filter(Boolean) };
      const saved = selectedId
        ? await RemoteFileApi.updateServer(selectedId, payload)
        : await RemoteFileApi.createServer(payload);
      await refresh(saved.id);
      setMessage(selectedId ? '已更新并明文写入本机注册文件' : '已注册并明文保存密码');
      onChanged();
      if (browse) onBrowse?.(saved);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!selectedId || busy) return;
    if (!window.confirm(`删除服务器“${draft.name || selectedId}”？此操作不可恢复。`)) return;
    setSaving(true);
    setError(null);
    try {
      await RemoteFileApi.deleteServer(selectedId);
      await refresh(null);
      setMessage('已删除该注册项');
      onChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '删除失败');
    } finally {
      setSaving(false);
    }
  };

  const test = async () => {
    if (busy) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const result = await RemoteFileApi.probeServer(draft);
      setProbe(result);
      setMessage(result.message);
      if (!result.ok) setError(result.message);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '测试连接失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="space-y-4 p-5" onSubmit={(event) => { event.preventDefault(); void save(); }}>
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onBack}
          disabled={saving}
          className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold disabled:opacity-40 ${light ? 'text-slate-600 hover:bg-slate-100' : 'text-slate-300 hover:bg-slate-800'}`}
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          返回打开文件
        </button>
        <p className={`text-[11px] ${light ? 'text-slate-500' : 'text-slate-400'}`}>密码以明文保存在本机注册文件中</p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={selectNew}
          disabled={busy}
          className={`rounded-md border px-2.5 py-1 text-[11px] font-semibold ${
            selectedId === null
              ? 'border-indigo-500 bg-indigo-600 text-white'
              : light ? 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50' : 'border-slate-700 bg-slate-950 text-slate-300 hover:bg-slate-800'
          }`}
        >
          + 新建服务器
        </button>
        {servers.map((server) => (
          <button
            key={server.id}
            type="button"
            onClick={() => selectServer(server)}
            disabled={busy}
            className={`max-w-[180px] truncate rounded-md border px-2.5 py-1 text-[11px] font-semibold ${
              selectedId === server.id
                ? 'border-indigo-500 bg-indigo-600 text-white'
                : light ? 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50' : 'border-slate-700 bg-slate-950 text-slate-300 hover:bg-slate-800'
            }`}
            title={`${server.name} · ${server.protocol.toUpperCase()} · ${server.host}`}
          >
            {server.protocol === 'smb' ? `${server.name} · SMB` : server.name}
          </button>
        ))}
      </div>

      {loading ? (
        <div className={`flex items-center gap-2 text-xs ${light ? 'text-slate-500' : 'text-slate-400'}`}>
          <LoaderCircle className="h-4 w-4 animate-spin" />
          正在读取注册项…
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block sm:col-span-2">
             <span className="mb-1.5 block text-xs font-semibold">显示名称（可选）</span>
             <input value={draft.name} onChange={(event) => patch({ name: event.target.value })} disabled={busy} placeholder="默认使用主机地址" className={field} />
          </label>
          <div className="sm:col-span-2">
            <span className="mb-1.5 block text-xs font-semibold">协议</span>
            <div className="flex gap-1.5">
              {(['sftp', 'smb'] as const).map((protocol) => (
                <button
                  key={protocol}
                  type="button"
                  disabled={busy}
                  onClick={() => patch({
                    protocol,
                    port: protocol === 'smb' ? (draft.port === 22 ? 445 : draft.port) : (draft.port === 445 ? 22 : draft.port),
                  })}
                  className={`rounded-md border px-3 py-1.5 text-[11px] font-semibold ${
                    draft.protocol === protocol
                      ? 'border-indigo-500 bg-indigo-600 text-white'
                      : light ? 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50' : 'border-slate-700 bg-slate-950 text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  {protocol === 'sftp' ? 'SFTP' : 'SMB'}
                </button>
              ))}
            </div>
          </div>
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold">主机</span>
            <input value={draft.host} onChange={(event) => patch({ host: event.target.value })} disabled={busy} placeholder="192.168.1.10" className={`${field} font-mono`} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold">端口</span>
            <input type="number" min={1} max={65535} value={draft.port} onChange={(event) => patch({ port: Number(event.target.value) })} disabled={busy} className={`${field} font-mono`} />
          </label>
          {draft.protocol === 'smb' ? (
            <>
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold">共享名</span>
                <input value={draft.share || ''} onChange={(event) => patch({ share: event.target.value })} disabled={busy} placeholder="logs" className={`${field} font-mono`} />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold">域（可空）</span>
                <input value={draft.domain || ''} onChange={(event) => patch({ domain: event.target.value })} disabled={busy} placeholder="WORKGROUP" className={`${field} font-mono`} />
              </label>
            </>
          ) : null}
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold">用户名</span>
            <input value={draft.user} onChange={(event) => patch({ user: event.target.value })} disabled={busy} className={`${field} font-mono`} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold">密码（明文保存）</span>
            <span className="relative block">
              <input
                type={showPassword ? 'text' : 'password'}
                value={draft.password}
                onChange={(event) => patch({ password: event.target.value })}
                disabled={busy}
                className={`${field} pr-10`}
              />
              <button
                type="button"
                onClick={() => setShowPassword((value) => !value)}
                className={`absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 ${light ? 'text-slate-500 hover:bg-slate-100' : 'text-slate-400 hover:bg-slate-800'}`}
                aria-label={showPassword ? '隐藏密码' : '显示密码'}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </span>
          </label>
          <div className="sm:col-span-2">
            <div className="mb-1.5 flex items-center justify-between">
               <span className="text-xs font-semibold">收藏路径（可选）</span>
              <button type="button" onClick={addPath} disabled={busy} className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-600 hover:underline">
                <FolderPlus className="h-3.5 w-3.5" />
                添加路径
              </button>
            </div>
            <div className="space-y-2">
              {draft.paths.map((item, index) => (
                <div key={index} className="flex items-center gap-2">
                  <input
                    value={item}
                    onChange={(event) => setPath(index, event.target.value)}
                    disabled={busy}
                     placeholder="/var/log（仅作为起始快捷方式）"
                    className={`${field} font-mono`}
                  />
                  <button
                    type="button"
                    onClick={() => removePath(index)}
                    disabled={busy || draft.paths.length <= 1}
                    className={`shrink-0 rounded-md p-2 disabled:opacity-30 ${light ? 'hover:bg-rose-50 text-rose-700 hover:text-rose-600' : 'hover:bg-rose-950/40 text-rose-300 hover:text-rose-200'}`}
                    aria-label="删除该路径"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
            <p className={`mt-1.5 text-[11px] ${light ? 'text-slate-500' : 'text-slate-400'}`}>收藏路径只用于快速进入起始目录；SFTP 浏览和命令可以访问服务器上的任意路径。SMB 路径相对于共享。</p>
          </div>
        </div>
      )}

      {probe && probe.paths.length > 0 ? (
        <ul className={`space-y-1 rounded-lg px-3 py-2 text-[11px] font-mono ${light ? 'bg-slate-50 text-slate-700' : 'bg-slate-950 text-slate-300'}`}>
          {probe.paths.map((item) => (
            <li key={item.path} className={item.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}>
              {item.ok ? '可访问' : '失败'} · {item.path} · {item.message}
            </li>
          ))}
        </ul>
      ) : null}

      {error ? <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p> : null}
      {message && !error ? <p className="text-xs text-emerald-600 dark:text-emerald-400">{message}</p> : null}

      <div className="flex flex-wrap justify-end gap-2 pt-1">
        {selectedId ? (
          <button type="button" onClick={remove} disabled={busy} className={`mr-auto rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-40 ${light ? 'border-rose-200 text-rose-700 hover:bg-rose-50' : 'border-rose-900 text-rose-300 hover:bg-rose-950/40'}`}>
            删除
          </button>
        ) : null}
        <button type="button" onClick={test} disabled={busy} className={`rounded-lg border px-4 py-2 text-xs font-semibold disabled:opacity-40 ${light ? 'border-slate-300 hover:bg-slate-100' : 'border-slate-700 hover:bg-slate-800'}`}>
          测试连接
        </button>
        <button type="submit" disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-40">
          {saving ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : selectedId ? <Server className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
          {selectedId ? '保存修改' : '注册服务器'}
        </button>
        {onBrowse ? <button type="button" onClick={() => void save(true)} disabled={busy} className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-40">保存并浏览</button> : null}
      </div>
    </form>
  );
};
