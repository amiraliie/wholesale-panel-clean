import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { requireRole } from '../middleware/rbac.middleware.js';
export const settingsRoutes = Router();
settingsRoutes.use(authMiddleware, requireRole('super_admin','admin'));
settingsRoutes.get('/', (_req,res)=>res.json({ok:true,data:{}}));
