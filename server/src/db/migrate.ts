import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { query, pool } from './pool.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  const sqlPath = path.resolve(__dirname, '../../db/migrations/001_init.sql');
  const sql = await fs.readFile(sqlPath, 'utf8');
  await query(sql);
  console.log('Database migration completed');
  await pool.end();
}
main().catch(async (err) => { console.error(err); await pool.end(); process.exit(1); });
