import crypto from 'crypto';
import { env } from '../config/env.js';

function key(): Buffer {
  const raw = env.ENCRYPTION_KEY;
  const b64 = Buffer.from(raw, 'base64');
  if (b64.length === 32) return b64;
  const hex = Buffer.from(raw, 'hex');
  if (hex.length === 32) return hex;
  return crypto.createHash('sha256').update(raw).digest();
}

export function encryptText(value: string): Buffer {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]);
}

export function decryptText(payload: Buffer): string {
  const iv = payload.subarray(0, 12);
  const tag = payload.subarray(12, 28);
  const encrypted = payload.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}
