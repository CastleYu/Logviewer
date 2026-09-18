import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import { ListenBackoff } from '../server/services/listenBackoff';

function occupy(host: string, port: number): Promise<net.Server> {
  return new Promise((resolve, reject) => {
    const holder = net.createServer();
    holder.once('error', reject);
    holder.listen(port, host, () => resolve(holder));
  });
}

function close(server: net.Server | http.Server): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}

async function verify(): Promise<void> {
  const host = '127.0.0.1';
  const start = 37931;
  const first = await occupy(host, start);
  const second = await occupy(host, start + 1);
  try {
    const picked = await ListenBackoff.pick(host, start, 5);
    assert.equal(picked, start + 2, 'pick must skip occupied ports');

    const httpServer = http.createServer((_request, response) => response.end('ok'));
    const bound = await ListenBackoff.listen(httpServer, host, start, 5);
    try {
      assert.equal(bound, start + 2, 'listen must bind the next free port');
      const response = await fetch(`http://${host}:${bound}/`);
      assert.equal(response.status, 200);
      assert.equal(await response.text(), 'ok');
    } finally {
      await close(httpServer);
    }

    await assert.rejects(() => ListenBackoff.pick(host, start, 2), /找到可用端口/);
    await assert.rejects(() => ListenBackoff.listen(http.createServer(), host, start, 2), /无法绑定/);
    await assert.rejects(() => ListenBackoff.pick(host, 0, 1), /1–65535/);
  } finally {
    await close(first);
    await close(second);
  }
  console.log('PASS: listen backoff skips occupied HTTP ports and binds the next free one');
}

await verify();
