import type { NextFunction, Response } from 'express';
import type { AuthenticatedRequest, UserRole } from '../types/index.js';
import { AppError } from './error.middleware.js';

export function requireRole(...roles: UserRole[]) {
  return (req: AuthenticatedRequest, _res: Response, next: NextFunction) => {
    if (!req.user) return next(new AppError(401, 'ابتدا وارد حساب کاربری شوید', 'UNAUTHENTICATED'));
    if (!roles.includes(req.user.role)) return next(new AppError(403, 'شما به این بخش دسترسی ندارید', 'FORBIDDEN'));
    next();
  };
}
