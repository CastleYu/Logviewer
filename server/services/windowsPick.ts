import { spawn } from 'node:child_process';
import { SourceError } from './sourceService';

export type PickKind = 'folder' | 'file';

function folderScript(): string {
  return `
Add-Type -AssemblyName System.Windows.Forms
[void][System.Windows.Forms.Application]::EnableVisualStyles()
$dialog = New-Object System.Windows.Forms.FolderBrowserDialog
$dialog.Description = '选择源码索引目录'
$dialog.ShowNewFolderButton = $true
try { $dialog.UseDescriptionForTitle = $true } catch {}
if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { [Console]::Out.Write($dialog.SelectedPath) }
`.trim();
}

function fileScript(fileName: string): string {
  const safe = fileName.replace(/'/g, "''");
  return `
Add-Type -AssemblyName System.Windows.Forms
[void][System.Windows.Forms.Application]::EnableVisualStyles()
$dialog = New-Object System.Windows.Forms.OpenFileDialog
$dialog.Title = '选择 ${safe}'
$dialog.Filter = '${safe}|${safe}|可执行文件|*.exe|所有文件|*.*'
$dialog.FileName = '${safe}'
$dialog.CheckFileExists = $true
if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { [Console]::Out.Write($dialog.FileName) }
`.trim();
}

export function pickPath(kind: PickKind, fileName = '', run = runPowerShell): Promise<string> {
  if (process.platform !== 'win32') return Promise.reject(new SourceError('文件夹选择仅支持 Windows', 400));
  const script = kind === 'folder' ? folderScript() : fileScript(fileName || '*.exe');
  return run(script);
}

export function runPowerShell(script: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('powershell.exe', ['-NoProfile', '-STA', '-Command', script], { windowsHide: false, shell: false });
    let out = '';
    let err = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new SourceError('选择对话框已超时', 408));
    }, 180_000);
    child.stdout?.on('data', (chunk) => { out += String(chunk); });
    child.stderr?.on('data', (chunk) => { err += String(chunk); });
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(new SourceError(error.message || '无法打开系统选择对话框', 500));
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code && !out.trim()) reject(new SourceError(err.trim() || '未选择路径', 400));
      else resolve(out.trim());
    });
  });
}
