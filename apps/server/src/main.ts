import { resolve } from 'node:path';
import { DEFAULT_PORT, announce, lanAddresses, startServer } from './index';

const port = Number(process.env.PORT ?? DEFAULT_PORT);
const serverName = process.env.SERVER_NAME ?? 'Favo';
const server = await startServer({
  port,
  clientDir: process.env.CLIENT_DIR ?? resolve(import.meta.dirname, '../../client/dist'),
  dataDir: process.env.DATA_DIR ?? resolve(import.meta.dirname, '../../../data'),
  serverName,
});
const beacon = announce(() => {
  const info = server.hub.info();
  return { name: serverName, port: server.port, rooms: info.rooms, players: info.players };
});

console.log(`
  Favo: servidor rodando na porta ${server.port}`);
console.log(`  Neste PC:      http://localhost:${server.port}`);
for (const ip of lanAddresses()) console.log(`  Na rede local: http://${ip}:${server.port}`);
console.log('');

const shutdown = () => {
  beacon.stop();
  server.close().finally(() => process.exit(0));
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
