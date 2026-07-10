import { query } from '../db/pool.js';
import { verifyPassword } from '../utils/password.js';
import { signAccessToken } from '../utils/jwt.js';
import { AppError } from '../middleware/error.middleware.js';
import type { AuthUser } from '../types/index.js';

export async function login(username: string, password: string) {
  const result = await query<any>(`
    SELECT
      u.id,
      u.username,
      u.email,
      u.password_hash,
      u.role,
      u.is_active,
      wc.id AS wholesale_customer_id,
      wc.is_active AS wholesale_is_active,
      wc.disabled_reason
    FROM users u
    LEFT JOIN wholesale_customers wc ON wc.user_id = u.id
    WHERE u.username = $1 OR u.email = $1
  `, [username]);

  const row = result.rows[0];

  if (!row || !(await verifyPassword(password, row.password_hash))) {
    throw new AppError(401, 'نام کاربری یا رمز عبور اشتباه است', 'BAD_CREDENTIALS');
  }

  const isWholesaleDisabled =
    row.role === 'wholesale' && row.wholesale_is_active === false;

  if (!row.is_active || isWholesaleDisabled) {
    throw new AppError(
      403,
      row.disabled_reason || 'حساب کاربری شما غیرفعال است',
      'USER_DISABLED',
    );
  }

  await query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [row.id]);

  const user: AuthUser = {
    id: row.id,
    username: row.username,
    email: row.email,
    role: row.role,
    isActive: row.is_active,
    wholesaleCustomerId: row.wholesale_customer_id,
  };

  return { user, accessToken: signAccessToken(user) };
}
