import { spawn, type ChildProcess } from 'node:child_process';
import { stat } from 'node:fs/promises';
import path from 'node:path';

class TermText {
  static readonly cmd = 'cmd.exe';
  static readonly missing = '终端目录不存在或不是目录';
  static readonly unsupported = '在终端继续仅支持 Windows';
}

export class AiTerminal {
  constructor(private readonly platform: NodeJS.Platform = process.platform, private readonly makeSpawn: typeof spawn = spawn) {}

  async open(directory: string, command: string): Promise<{ opened: boolean; command: string }> {
    if (this.platform !== 'win32') throw new Error(TermText.unsupported);
    if (!path.win32.isAbsolute(directory)) throw new Error('终端目录必须是绝对路径');
    try { if (!(await stat(directory)).isDirectory()) throw new Error(TermText.missing); }
    catch (error) { if (error instanceof Error && error.message === TermText.missing) throw error; throw new Error(`${TermText.missing}: ${directory}`); }
    let child: ChildProcess;
    try {
      child = this.makeSpawn(process.env.ComSpec || TermText.cmd, ['/d', '/c', 'start', '""', '/D', directory, TermText.cmd, '/k', command], { cwd: directory, detached: true, stdio: 'ignore', windowsHide: false });
    } catch (error) { throw new Error(`无法打开终端：${error instanceof Error ? error.message.split('\n')[0] : '启动失败'}`); }
    await new Promise<void>((resolve, reject) => {
      child.once('error', (error) => reject(new Error(`无法打开终端：${error.message.split('\n')[0]}`)));
      child.once('spawn', () => resolve());
    });
    child.unref();
    return { opened: true, command };
  }
}
