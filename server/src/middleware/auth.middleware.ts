import type { NextFunction, Response } from 'express';
import { query } from '../db/pool.js';
import { verifyAccessToken } from '../utils/jwt.js';
import { AppError } from './error.middleware.js';
import type { AuthenticatedRequest, AuthUser } from '../types/index.js';

export async function authMiddleware(req: AuthenticatedRequest, _res: Response, next: NextFunction) {
  try {
    const bearer = req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : null;
    const token = req.cookies?.access_token || bearer;
    if (!token) throw new AppError(401, 'ابتدا وارد حساب کاربری شوید', 'UNAUTHENTICATED');

    const payload = verifyAccessToken(token);
    const result = await query<any>(`
      SELECT u.id, u.username, u.email, u.role, u.is_active,
             wc.id AS wholesale_customer_id
      FROM users u
      LEFT JOIN wholesale_customers wc ON wc.user_id = u.id
      WHERE u.id = $1
    `, [payload.sub]);

    const row = result.rows[0];
    if (!row || !row.is_active) throw new AppError(401, 'حساب کاربری غیرفعال یا نامعتبر است', 'USER_DISABLED');

    req.user = {
      id: row.id,
      username: row.username,
      email: row.email,
      role: row.role,
      isActive: row.is_active,
      wholesaleCustomerId: row.wholesale_customer_id,
    } satisfies AuthUser;
    next();
  } catch (error) {
    next(error instanceof AppError ? error : new AppError(401, 'نشست ورود نامعتبر است', 'INVALID_TOKEN'));
  }
}
