import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { query, pool } from '../db/pool.js';
import { hashPassword } from '../utils/password.js';

async function main() {
  const rl = readline.createInterface({ input, output });
  const username = await rl.question('Admin username: ');
  const email = await rl.question('Admin email: ');
  const password = await rl.question('Admin password: ');
  rl.close();
  const hash = await hashPassword(password);
  const res = await query(`INSERT INTO users (username,email,password_hash,role,is_active) VALUES ($1,$2,$3,'super_admin',true)
    ON CONFLICT (username) DO UPDATE SET email=EXCLUDED.email,password_hash=EXCLUDED.password_hash,is_active=true RETURNING id,username,email,role`, [username, email, hash]);
  console.log(res.rows[0]);
  await pool.end();
}
main().catch(async (e)=>{ console.error(e); await pool.end(); process.exit(1); });
