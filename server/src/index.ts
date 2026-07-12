process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

import { createServer } from 'http';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { assertDatabaseConnection, pool } from './db/pool.js';

async function main() {
  await assertDatabaseConnection();
  const app = createApp();
  const server = createServer(app);
  server.listen(env.PORT, '127.0.0.1', () => {
    console.log(`API listening on http://127.0.0.1:${env.PORT}`);
  });
  const shutdown = async () => {
    console.log('Shutting down...');
    server.close(async () => {
      await pool.end();
      process.exit(0);
    });
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
