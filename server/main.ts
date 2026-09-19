import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { SourceConst } from '../src/config/sourceTypes';
import { SourceService } from './services/sourceService';
import { registerSourceRoutes } from './routes/sourceRoutes';
import { HttpConst } from './config/httpConstants';
import { localAccess } from './routes/localAccess';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import { EnvKey, ServerValue } from './config/constants';
import { RemoteRegistry } from './config/remoteRegistry';
import { SftpConfig } from './config/sftpConfig';
import { registerErrorRoute, registerSftpRoutes } from './routes/sftpRoutes';
import { DownloadService } from './services/downloadService';
import { ListenBackoff } from './services/listenBackoff';
import { HistoryConst } from '../src/config/historyTypes';
import { HistoryStore } from './services/historyStore';
import { registerHistoryRoutes } from './routes/historyRoutes';
import { AiService } from './services/aiService';
import { registerAiRoutes } from './routes/aiRoutes';
import { closeRemoteSessions } from './services/remoteSession';

dotenv.config();

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const app = express();
const preferredPort = Number(process.env[EnvKey.ListenPort]) || ServerValue.DefaultListenPort;
const production = process.argv.includes('--production');
const host = '127.0.0.1';

app.use(HttpConst.Api, localAccess);
const history = new HistoryStore(path.join(rootDir, HistoryConst.Store));
const ai = new AiService(path.join(rootDir, '.logviewer-ai'), history);
await ai.init();
registerAiRoutes(app, ai);
app.use(express.json({ limit: '1mb' }));
registerHistoryRoutes(app, history);
const sources = new SourceService(path.join(rootDir, SourceConst.Store));
await sources.init();
registerSourceRoutes(app, sources);
const sftpProfile = SftpConfig.load();
const registry = new RemoteRegistry(path.join(rootDir, ServerValue.RegistryFile));
registerSftpRoutes(app, new DownloadService(sftpProfile, rootDir, (id) => registry.toProfile(id)), sftpProfile, registry);

if (production) {
  app.use(express.static(path.join(rootDir, 'dist')));
  app.get('*', (_request, response) => response.sendFile(path.join(rootDir, 'dist', 'index.html')));
} else {
  const preferredHmr = Number(process.env[EnvKey.HmrPort]) || ServerValue.DefaultHmrPort;
  const hmrPort = await ListenBackoff.pick(host, preferredHmr, ServerValue.PortBackoffTries);
  process.env[EnvKey.HmrPort] = String(hmrPort);
  if (hmrPort !== preferredHmr) {
    process.stdout.write(`Vite HMR 端口 ${preferredHmr} 占用中，改用 ${hmrPort}\n`);
  }
  const vite = await createViteServer({
    root: rootDir,
    server: {
      middlewareMode: true,
      hmr: process.env.DISABLE_HMR === 'true' ? false : { host, port: hmrPort },
    },
    appType: 'spa',
  });
  app.use(vite.middlewares);
}

registerErrorRoute(app);
const server = http.createServer(app);
const port = await ListenBackoff.listen(server, host, preferredPort, ServerValue.PortBackoffTries);
if (port !== preferredPort) {
  process.stdout.write(`HTTP 端口 ${preferredPort} 占用中，改用 ${port}\n`);
}
process.stdout.write(`LogViewer running at http://${host}:${port}\n`);
const shutdown = () => { void Promise.all([ai.close(), closeRemoteSessions()]).finally(() => { server.close(); process.exit(0); }); };
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
