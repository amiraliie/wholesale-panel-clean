import { query, pool } from '../db/pool.js';
import { syncInbounds } from '../services/server.service.js';

async function main() {
  const res = await query<any>('SELECT id,name FROM servers WHERE is_active=true');
  for (const server of res.rows) {
    console.log(`Syncing ${server.name}...`);
    const rows = await syncInbounds(server.id);
    console.log(`  ${rows.length} inbounds synced`);
  }
  await pool.end();
}
main().catch(async (e)=>{ console.error(e); await pool.end(); process.exit(1); });
