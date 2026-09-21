import net from 'node:net';
const port = Number(process.argv[2]);
const server = net.createServer();
server.listen(port, '127.0.0.1');
process.on('SIGTERM', () => server.close(() => process.exit(0)));
