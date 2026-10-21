import { RemoteUi } from '../config/fileLoadTypes';

export class TextCodec {
  static readonly Utf8 = 'utf-8';
  static readonly Gbk = 'gb18030';

  /** 先严格按 UTF-8 解码，失败再按 GB18030（兼容 GBK）解码，覆盖国内服务器常见日志编码。 */
  static decode(bytes: ArrayBuffer): { text: string; encoding: string } {
    const view = new Uint8Array(bytes);
    const start = view[0] === 0xef && view[1] === 0xbb && view[2] === 0xbf ? 3 : 0;
    const body = view.subarray(start);
    try {
      return { text: new TextDecoder(this.Utf8, { fatal: true }).decode(body), encoding: this.Utf8 };
    } catch {
      try {
        return { text: new TextDecoder(this.Gbk).decode(body), encoding: this.Gbk };
      } catch {
        return { text: new TextDecoder(this.Utf8).decode(body), encoding: this.Utf8 };
      }
    }
  }

  /** NUL 字节几乎不会出现在文本日志里，用来提前拦截二进制文件。 */
  static binary(bytes: ArrayBuffer): boolean {
    const view = new Uint8Array(bytes, 0, Math.min(bytes.byteLength, RemoteUi.BinaryProbeBytes));
    return view.includes(0);
  }
}
