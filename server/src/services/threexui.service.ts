import { env } from '../config/env.js';
import { decryptText } from '../utils/crypto.js';
import { AppError } from '../middleware/error.middleware.js';
import type { ThreeXUIServerRow } from '../types/index.js';

export interface ThreeXUIClientTraffic {
  id?: number | string;
  inboundId?: number | string;
  email?: string;
  enable?: boolean;
  up?: number | string;
  down?: number | string;
  total?: number | string;
  expiryTime?: number | string;
  reset?: number | string;
}

export interface ThreeXUIInbound {
  id: number;
  remark?: string;
  tag?: string;
  protocol: string;
  port: number;
  enable?: boolean;
  settings?: string;
  streamSettings?: string;
  clientStats?: ThreeXUIClientTraffic[];
}

function baseUrl(server: ThreeXUIServerRow): string {
  const host = server.host.startsWith('http') ? server.host : `http://${server.host}`;
  const url = new URL(host);
  url.port = String(server.port);
  const path = server.base_path?.replace(/\/$/, '') || '';
  return `${url.origin}${path}`;
}

async function fetchWithTimeout(url: string, init: RequestInit = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.THREEXUI_TIMEOUT);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err: any) {
    throw new AppError(502, `ارتباط با پنل برقرار نشد: ${err.message}`, 'THREEXUI_CONNECTION_ERROR');
  } finally {
    clearTimeout(timeout);
  }
}

function safeJsonParse<T = any>(value?: string | null): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

export class ThreeXUIService {
  private cookieByServerId = new Map<string, string>();

  private trafficCacheByServerId = new Map<
    string,
    {
      expiresAt: number;
      inbounds: ThreeXUIInbound[];
    }
  >();

  async login(server: ThreeXUIServerRow): Promise<string> {
    const username = decryptText(server.username_encrypted);
    const password = decryptText(server.password_encrypted);
    const body = new URLSearchParams({ username, password });

    const res = await fetchWithTimeout(`${baseUrl(server)}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });

    if (!res.ok) {
      throw new AppError(502, 'ورود به 3x-ui ناموفق بود', 'THREEXUI_LOGIN_FAILED');
    }

    const cookie = res.headers.get('set-cookie')?.split(';')[0];

    if (!cookie) {
      throw new AppError(502, 'کوکی نشست 3x-ui دریافت نشد', 'THREEXUI_COOKIE_MISSING');
    }

    this.cookieByServerId.set(server.id, cookie);
    return cookie;
  }

  private async request<T>(server: ThreeXUIServerRow, path: string, init: RequestInit = {}, retry = true): Promise<T> {
    let cookie = this.cookieByServerId.get(server.id);

    if (!cookie) {
      cookie = await this.login(server);
    }

    const res = await fetchWithTimeout(`${baseUrl(server)}${path}`, {
      ...init,
      headers: { ...(init.headers || {}), Cookie: cookie },
    });

    if ((res.status === 401 || res.status === 403) && retry) {
      this.cookieByServerId.delete(server.id);
      return this.request<T>(server, path, init, false);
    }

    if (!res.ok) {
      throw new AppError(502, `خطای 3x-ui: ${res.status}`, 'THREEXUI_HTTP_ERROR');
    }

    return res.json() as Promise<T>;
  }

  async testConnection(server: ThreeXUIServerRow) {
    await this.login(server);
    return { ok: true };
  }

  async listInbounds(server: ThreeXUIServerRow): Promise<ThreeXUIInbound[]> {
    const data: any = await this.request(server, '/panel/api/inbounds/list');

    if (data?.success === false) {
      throw new AppError(502, data.msg || 'دریافت اینباندها ناموفق بود', 'THREEXUI_FAILED');
    }

    return data?.obj || [];
  }

  async listInboundsWithTraffic(
    server: ThreeXUIServerRow,
    ttlMs = 60_000,
  ): Promise<ThreeXUIInbound[]> {
    const cached = this.trafficCacheByServerId.get(server.id);

    if (cached && cached.expiresAt > Date.now()) {
      return cached.inbounds;
    }

    const inbounds = await this.listInbounds(server);

    this.trafficCacheByServerId.set(server.id, {
      expiresAt: Date.now() + ttlMs,
      inbounds,
    });

    return inbounds;
  }

  invalidateTrafficCache(serverId: string) {
    this.trafficCacheByServerId.delete(serverId);
  }

  async addClient(server: ThreeXUIServerRow, inboundId: number, client: any) {
    const payload = { id: inboundId, settings: JSON.stringify({ clients: [client] }) };

    const data: any = await this.request(server, '/panel/api/inbounds/addClient', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (data?.success === false) {
      throw new AppError(502, data.msg || 'ساخت کلاینت در 3x-ui ناموفق بود', 'THREEXUI_ADD_CLIENT_FAILED');
    }

    return data;
  }

  async findClient(server: ThreeXUIServerRow, inboundId: number, clientId: string) {
    const inbounds = await this.listInbounds(server);
    const inbound = inbounds.find((item) => Number(item.id) === Number(inboundId));

    if (!inbound) {
      throw new AppError(404, 'اینباند در 3x-ui پیدا نشد', 'THREEXUI_INBOUND_NOT_FOUND');
    }

    const settings = safeJsonParse<any>(inbound.settings);
    const clients = Array.isArray(settings?.clients) ? settings.clients : [];
    const client = clients.find((item: any) => String(item.id) === String(clientId));

    if (!client) {
      throw new AppError(404, 'کلاینت در 3x-ui پیدا نشد', 'THREEXUI_CLIENT_NOT_FOUND');
    }

    return { inbound, client };
  }

  async updateClient(server: ThreeXUIServerRow, inboundId: number, clientId: string, patch: Record<string, any>) {
    const found = await this.findClient(server, inboundId, clientId);
    const updatedClient = { ...found.client, ...patch, id: clientId };
    const payload = {
      id: inboundId,
      settings: JSON.stringify({ clients: [updatedClient] }),
    };

    const data: any = await this.request(server, `/panel/api/inbounds/updateClient/${encodeURIComponent(clientId)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (data?.success === false) {
      throw new AppError(502, data.msg || 'آپدیت کلاینت در 3x-ui ناموفق بود', 'THREEXUI_UPDATE_CLIENT_FAILED');
    }

    return data;
  }

  async deleteClient(server: ThreeXUIServerRow, inboundId: number, clientId: string) {
    const path = `/panel/api/inbounds/${Number(inboundId)}/delClient/${encodeURIComponent(clientId)}`;

    const data: any = await this.request(server, path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    if (data?.success === false) {
      throw new AppError(502, data.msg || 'حذف کلاینت در 3x-ui ناموفق بود', 'THREEXUI_DELETE_CLIENT_FAILED');
    }

    return data;
  }
}

export const threeXUIService = new ThreeXUIService();
