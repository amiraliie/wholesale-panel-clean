import type { Request } from 'express';

export type UserRole = 'super_admin' | 'admin' | 'wholesale';

export interface AuthUser {
  id: string;
  username: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  wholesaleCustomerId?: string | null;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthUser;
}

export interface ApiResponse<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
}

export interface ThreeXUIServerRow {
  id: string;
  name: string;
  host: string;
  port: number;
  base_path: string;
  username_encrypted: Buffer;
  password_encrypted: Buffer;
  is_active: boolean;
  location?: string | null;
  description?: string | null;
}
