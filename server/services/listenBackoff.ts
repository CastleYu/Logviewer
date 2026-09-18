import http from 'node:http';
import net from 'node:net';

export class ListenBackoff {
  static readonly Tries = 20;

  static async pick(host: string, startPort: number, tries = this.Tries): Promise<number> {
    this.assertPort(startPort);
    for (let offset = 0; offset < tries; offset += 1) {
      const port = startPort + offset;
      if (port > 65535) break;
      if (await this.free(host, port)) return port;
    }
    throw new Error(`无法在 ${host}:${startPort}–${Math.min(65535, startPort + tries - 1)} 找到可用端口`);
  }

  static listen(server: http.Server, host: string, startPort: number, tries = this.Tries): Promise<number> {
    this.assertPort(startPort);
    return new Promise((resolve, reject) => {
      let port = startPort;
      const onError = (error: NodeJS.ErrnoException) => {
        if (error.code !== 'EADDRINUSE' && error.code !== 'EACCES') {
          server.off('error', onError);
          reject(error);
          return;
        }
        port += 1;
        if (port > 65535 || port >= startPort + tries) {
          server.off('error', onError);
          reject(new Error(`无法绑定 ${host}:${startPort}–${Math.min(65535, startPort + tries - 1)}，端口均被占用或无权限`));
          return;
        }
        server.listen(port, host);
      };
      server.on('error', onError);
      server.once('listening', () => {
        server.off('error', onError);
        resolve(port);
      });
      server.listen(startPort, host);
    });
  }

  private static free(host: string, port: number): Promise<boolean> {
    return new Promise((resolve, reject) => {
      const probe = net.createServer();
      probe.once('error', (error: NodeJS.ErrnoException) => {
        if (error.code === 'EADDRINUSE' || error.code === 'EACCES') resolve(false);
        else reject(error);
      });
      probe.listen(port, host, () => {
        probe.close((closeError) => {
          if (closeError) reject(closeError);
          else resolve(true);
        });
      });
    });
  }

  private static assertPort(port: number): void {
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error('端口必须是 1–65535 的整数');
    }
  }
}
