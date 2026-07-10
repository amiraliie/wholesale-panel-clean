import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { query, pool } from '../db/pool.js';
import { hashPassword } from '../utils/password.js';

async function main() {
  const rl = readline.createInterface({ input, output });

  async function readValue(envName: string, prompt: string, trim = true) {
    const envValue = process.env[envName];
    if (envValue !== undefined && envValue !== '') {
      return trim ? envValue.trim() : envValue;
    }

    const value = await rl.question(prompt);
    return trim ? value.trim() : value;
  }

  const username = await readValue('ADMIN_USERNAME', 'Admin username: ');
  const email = await readValue('ADMIN_EMAIL', 'Admin email: ');
  const password = await readValue('ADMIN_PASSWORD', 'Admin password: ', false);

  rl.close();

  if (!username) throw new Error('Admin username is required.');
  if (!email) throw new Error('Admin email is required.');
  if (!password) throw new Error('Admin password is required.');

  const hash = await hashPassword(password);

  const res = await query(
    `INSERT INTO users (username,email,password_hash,role,is_active)
     VALUES ($1,$2,$3,'super_admin',true)
     ON CONFLICT (username) DO UPDATE
     SET email=EXCLUDED.email,
         password_hash=EXCLUDED.password_hash,
         is_active=true
     RETURNING id,username,email,role`,
    [username, email, hash]
  );

  console.log(res.rows[0]);
  await pool.end();
}

main().catch(async (e) => {
  console.error(e);
  await pool.end();
  process.exit(1);
});
