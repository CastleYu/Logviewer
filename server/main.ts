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
import { SftpConfig } from './config/sftpConfig';
import { registerErrorRoute, registerSftpRoutes } from './routes/sftpRoutes';
import { DownloadService } from './services/downloadService';

dotenv.config();

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const app = express();
const port = Number(process.env[EnvKey.ListenPort]) || ServerValue.DefaultListenPort;
const production = process.argv.includes('--production');

app.use(HttpConst.Api, localAccess);
app.use(express.json({ limit: '32kb' }));
const sources = new SourceService(path.join(rootDir, SourceConst.Store));
await sources.init();
registerSourceRoutes(app, sources);
const sftpProfile = SftpConfig.load();
registerSftpRoutes(app, new DownloadService(sftpProfile, rootDir), sftpProfile);

if (production) {
  app.use(express.static(path.join(rootDir, 'dist')));
  app.get('*', (_request, response) => response.sendFile(path.join(rootDir, 'dist', 'index.html')));
} else {
  const vite = await createViteServer({ root: rootDir, server: { middlewareMode: true }, appType: 'spa' });
  app.use(vite.middlewares);
}

registerErrorRoute(app);
app.listen(port, '127.0.0.1', () => {
  process.stdout.write(`LogViewer running at http://127.0.0.1:${port}\n`);
});
