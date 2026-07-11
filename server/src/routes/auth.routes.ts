import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { asyncHandler } from '../utils/async-handler.js';
import { loginSchema } from '../validators/auth.schema.js';
import { login } from '../services/auth.service.js';
import type { AuthenticatedRequest } from '../types/index.js';
import { env } from '../config/env.js';

export const authRoutes = Router();

const isSecureCookie = env.APP_URL.startsWith('https://');
const ACCESS_TOKEN_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

authRoutes.post('/login', asyncHandler(async (req, res) => {
  const input = loginSchema.parse(req.body);
  const result = await login(input.username, input.password);

  res.cookie('access_token', result.accessToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isSecureCookie,
    maxAge: ACCESS_TOKEN_MAX_AGE_MS,
    path: '/',
  });

  res.json({ ok: true, data: { user: result.user } });
}));

authRoutes.get('/me', authMiddleware, asyncHandler(async (req: AuthenticatedRequest, res) => {
  res.json({ ok: true, data: { user: req.user } });
}));

authRoutes.post('/logout', asyncHandler(async (_req, res) => {
  res.clearCookie('access_token', {
    httpOnly: true,
    sameSite: 'lax',
    secure: isSecureCookie,
    path: '/',
  });

  res.json({ ok: true });
}));
