import path from 'node:path';
import { SourceConst } from '../config/sourceTypes';

export function openerLaunchArgs(exe: string, file: string, line: number): string[] {
  const base = path.basename(exe).toLowerCase();
  if (base === 'code.exe' || base === 'code - insiders.exe' || base === 'cursor.exe' || base === 'codium.exe') {
    return ['-r', '-g', `${file}:${line}`];
  }
  if (/(pycharm|idea|clion|webstorm|goland|rider|phpstorm|rubymine|datagrip)/i.test(base) || /64\.exe$/i.test(base)) {
    return [SourceConst.LineArg, String(line), file];
  }
  return [file];
}
