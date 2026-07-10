// @file: inbox-serve — start the inbox-api server with mock data for dev/e2e.
// @consumers: playwright webServer, manual dev
// @tasks: TSK-107

import { HttpServer } from '../inbox-api/http-server.ts';
import { BoardProviderMock } from '../inbox-api/board-provider.mock.ts';
import { seedDevData } from './dev-seed.ts';

const PORT = 4174;

const provider = await seedDevData(new BoardProviderMock());
const server = new HttpServer({ port: PORT, boardProvider: provider });

await server.start();
console.log(`[inbox-serve] API server started on http://localhost:${PORT}`);

process.on('SIGINT', () => {
  console.log('[inbox-serve] Shutting down...');
  server.stop().then(() => process.exit(0));
});

process.on('SIGTERM', () => {
  console.log('[inbox-serve] Shutting down...');
  server.stop().then(() => process.exit(0));
});
