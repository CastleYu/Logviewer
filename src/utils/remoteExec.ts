export const ExecCwdMarker = '__LV_CWD__';

export function shQuote(value: string): string {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

export function wrapRemoteCommand(cwd: string, command: string): string {
  const inner = `cd ${shQuote(cwd)} || exit 1\n${command}\nstatus=$?\nprintf '\\n${ExecCwdMarker}%s\\n' "$PWD"\nexit "$status"`;
  return `sh -c ${shQuote(inner)}`;
}

export function parseExecOutput(stdout: string): { text: string; cwd: string | null } {
  const idx = stdout.lastIndexOf(ExecCwdMarker);
  if (idx < 0) return { text: stdout.replace(/\s+$/g, ''), cwd: null };
  const text = stdout.slice(0, idx).replace(/\s+$/g, '');
  const cwd = stdout.slice(idx + ExecCwdMarker.length).trim().split(/\r?\n/)[0]?.trim() || null;
  return { text, cwd: cwd && cwd.startsWith('/') ? cwd : null };
}

export function filterServerProfiles<T extends { id: string; name: string; protocol?: string; ready?: boolean }>(
  profiles: T[],
  query: string,
): T[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return profiles;
  return profiles.filter((item) => [item.name, item.id, item.protocol || '', item.ready ? 'ready' : '']
    .join(' ')
    .toLowerCase()
    .includes(needle));
}
