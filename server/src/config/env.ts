import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  APP_URL: z.string().url().default('http://localhost:8080'),
  API_URL: z.string().url().optional(),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('7d'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
  COOKIE_SECRET: z.string().min(16),
  ENCRYPTION_KEY: z.string().min(16),
  CORS_ORIGIN: z.string().default('http://localhost:8080'),
  SUBSCRIPTION_PUBLIC_URL: z.string().url().default('http://localhost:8080/sub'),
  THREEXUI_TIMEOUT: z.coerce.number().int().positive().default(30000),
  THREEXUI_RETRY_ATTEMPTS: z.coerce.number().int().min(0).max(5).default(2),
  BCRYPT_ROUNDS: z.coerce.number().int().min(10).max(14).default(12),
  RECEIPT_UPLOAD_DIR: z.string().default('./uploads/receipts'),
});

export const env = schema.parse(process.env);
export const isProduction = env.NODE_ENV === 'production';
