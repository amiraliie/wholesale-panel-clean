import jwt, { type SignOptions } from 'jsonwebtoken';
import { env } from '../config/env.js';
import type { AuthUser } from '../types/index.js';

export interface TokenPayload {
  sub: string;
  username: string;
  email: string;
  role: AuthUser['role'];
  wholesaleCustomerId?: string | null;
}

export function signAccessToken(user: AuthUser): string {
  const payload: TokenPayload = {
    sub: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
    wholesaleCustomerId: user.wholesaleCustomerId ?? null,
  };

  const options: SignOptions = {
    expiresIn: env.JWT_EXPIRES_IN as SignOptions['expiresIn'],
  };

  return jwt.sign(payload, env.JWT_SECRET, options);
}

export function verifyAccessToken(token: string): TokenPayload {
  return jwt.verify(token, env.JWT_SECRET) as TokenPayload;
}
