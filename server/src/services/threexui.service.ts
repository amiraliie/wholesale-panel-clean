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

interface ThreeXUIResponse<T = unknown> {
  success?: boolean;
  msg?: string;
  obj?: T;
}

interface SessionState {
  cookie: string;
  csrfToken?: string;
}

function normalizeBasePath(value?: string | null): string {
  const path = String(value || '').trim();

  if (!path || path === '/') {
    return '';
  }

  return `/${path.replace(/^\/+|\/+$/g, '')}`;
}

function baseUrl(server: ThreeXUIServerRow): string {
  const rawHost = String(server.host || '').trim();
  const host = /^https?:\/\//i.test(rawHost)
    ? rawHost
    : `http://${rawHost}`;

  let url: URL;

  try {
    url = new URL(host);
  } catch {
    throw new AppError(
      400,
      'آدرس سرور 3x-ui معتبر نیست',
      'THREEXUI_INVALID_URL',
    );
  }

  url.port = String(server.port);
  url.pathname = '/';
  url.search = '';
  url.hash = '';

  return `${url.origin}${normalizeBasePath(server.base_path)}`;
}

function endpoint(
  server: ThreeXUIServerRow,
  path: string,
): string {
  const normalizedPath = path.startsWith('/')
    ? path
    : `/${path}`;

  return `${baseUrl(server)}${normalizedPath}`;
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
) {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    env.THREEXUI_TIMEOUT,
  );

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } catch (error: any) {
    const message =
      error?.name === 'AbortError'
        ? 'زمان اتصال به پایان رسید'
        : error?.message || 'خطای شبکه';

    throw new AppError(
      502,
      `ارتباط با پنل 3x-ui برقرار نشد: ${message}`,
      'THREEXUI_CONNECTION_ERROR',
    );
  } finally {
    clearTimeout(timeout);
  }
}

function safeJsonParse<T = any>(
  value?: string | null,
): T | null {
  if (!value) return null;

  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

async function readResponseJson<T>(
  response: Response,
): Promise<ThreeXUIResponse<T> | null> {
  const text = await response.text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as ThreeXUIResponse<T>;
  } catch {
    return null;
  }
}

function responseCookies(response: Response): string {
  const headers = response.headers as Headers & {
    getSetCookie?: () => string[];
  };

  const values =
    typeof headers.getSetCookie === 'function'
      ? headers.getSetCookie()
      : response.headers.get('set-cookie')
        ? [response.headers.get('set-cookie') as string]
        : [];

  const cookies = values
    .map((value) => value.split(';', 1)[0]?.trim())
    .filter((value): value is string => Boolean(value));

  return mergeCookies(...cookies);
}

function mergeCookies(...cookieHeaders: string[]): string {
  const cookies = new Map<string, string>();

  for (const header of cookieHeaders) {
    for (const part of header.split(/;\s*/)) {
      const separator = part.indexOf('=');

      if (separator <= 0) continue;

      const name = part.slice(0, separator).trim();

      if (name) {
        cookies.set(name, part.trim());
      }
    }
  }

  return [...cookies.values()].join('; ');
}

function isSafeMethod(method?: string): boolean {
  return ['GET', 'HEAD', 'OPTIONS', 'TRACE'].includes(
    String(method || 'GET').toUpperCase(),
  );
}

export class ThreeXUIService {
  private sessionByServerId = new Map<
    string,
    SessionState
  >();

  private trafficCacheByServerId = new Map<
    string,
    {
      expiresAt: number;
      inbounds: ThreeXUIInbound[];
    }
  >();

  private async loginWithCsrf(
    server: ThreeXUIServerRow,
    username: string,
    password: string,
  ): Promise<SessionState | null> {
    const csrfResponse = await fetchWithTimeout(
      endpoint(server, '/csrf-token'),
      {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
      },
    );

    const csrfData =
      await readResponseJson<string>(csrfResponse);

    const csrfToken =
      csrfData?.success !== false &&
      typeof csrfData?.obj === 'string'
        ? csrfData.obj
        : '';

    // نسخه‌های قدیمی endpoint مربوط به CSRF ندارند.
    if (!csrfResponse.ok || !csrfToken) {
      return null;
    }

    const initialCookie = responseCookies(csrfResponse);
    const body = new URLSearchParams({
      username,
      password,
    });

    const headers: Record<string, string> = {
      Accept: 'application/json',
      'Content-Type':
        'application/x-www-form-urlencoded',
      'X-CSRF-Token': csrfToken,
    };

    if (initialCookie) {
      headers.Cookie = initialCookie;
    }

    const loginResponse = await fetchWithTimeout(
      endpoint(server, '/login'),
      {
        method: 'POST',
        headers,
        body,
      },
    );

    const loginData =
      await readResponseJson(loginResponse);

    if (
      !loginResponse.ok ||
      loginData?.success === false
    ) {
      throw new AppError(
        502,
        loginData?.msg ||
          `ورود به 3x-ui ناموفق بود (${loginResponse.status})`,
        'THREEXUI_LOGIN_FAILED',
      );
    }

    let cookie = mergeCookies(
      initialCookie,
      responseCookies(loginResponse),
    );

    if (!cookie) {
      throw new AppError(
        502,
        'کوکی نشست 3x-ui دریافت نشد',
        'THREEXUI_COOKIE_MISSING',
      );
    }

    // دریافت مجدد توکن از نشست نهایی بعد از ورود.
    const refreshedCsrfResponse = await fetchWithTimeout(
      endpoint(server, '/csrf-token'),
      {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          Cookie: cookie,
        },
      },
    );

    const refreshedCsrfData =
      await readResponseJson<string>(
        refreshedCsrfResponse,
      );

    cookie = mergeCookies(
      cookie,
      responseCookies(refreshedCsrfResponse),
    );

    return {
      cookie,
      csrfToken:
        refreshedCsrfData?.success !== false &&
        typeof refreshedCsrfData?.obj === 'string'
          ? refreshedCsrfData.obj
          : csrfToken,
    };
  }

  private async loginLegacy(
    server: ThreeXUIServerRow,
    username: string,
    password: string,
  ): Promise<SessionState> {
    const body = new URLSearchParams({
      username,
      password,
    });

    const response = await fetchWithTimeout(
      endpoint(server, '/login'),
      {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type':
            'application/x-www-form-urlencoded',
        },
        body,
      },
    );

    const data = await readResponseJson(response);

    if (!response.ok || data?.success === false) {
      throw new AppError(
        502,
        data?.msg ||
          `ورود به 3x-ui ناموفق بود (${response.status})`,
        'THREEXUI_LOGIN_FAILED',
      );
    }

    const cookie = responseCookies(response);

    if (!cookie) {
      throw new AppError(
        502,
        'کوکی نشست 3x-ui دریافت نشد',
        'THREEXUI_COOKIE_MISSING',
      );
    }

    return { cookie };
  }

  async login(
    server: ThreeXUIServerRow,
  ): Promise<string> {
    const username = decryptText(
      server.username_encrypted,
    );

    const password = decryptText(
      server.password_encrypted,
    );

    const session =
      (await this.loginWithCsrf(
        server,
        username,
        password,
      )) ||
      (await this.loginLegacy(
        server,
        username,
        password,
      ));

    this.sessionByServerId.set(server.id, session);

    return session.cookie;
  }

  private async request<T>(
    server: ThreeXUIServerRow,
    path: string,
    init: RequestInit = {},
    retry = true,
  ): Promise<T> {
    let session =
      this.sessionByServerId.get(server.id);

    if (!session) {
      await this.login(server);
      session = this.sessionByServerId.get(server.id);
    }

    if (!session) {
      throw new AppError(
        502,
        'نشست 3x-ui ایجاد نشد',
        'THREEXUI_SESSION_MISSING',
      );
    }

    const headers = new Headers(init.headers);

    headers.set('Accept', 'application/json');
    headers.set('Cookie', session.cookie);

    if (
      session.csrfToken &&
      !isSafeMethod(init.method)
    ) {
      headers.set(
        'X-CSRF-Token',
        session.csrfToken,
      );
    }

    const response = await fetchWithTimeout(
      endpoint(server, path),
      {
        ...init,
        headers,
      },
    );

    if (
      (response.status === 401 ||
        response.status === 403) &&
      retry
    ) {
      this.sessionByServerId.delete(server.id);

      return this.request<T>(
        server,
        path,
        init,
        false,
      );
    }

    const data = await readResponseJson(response);

    if (!response.ok) {
      throw new AppError(
        502,
        data?.msg ||
          `خطای 3x-ui: ${response.status}`,
        'THREEXUI_HTTP_ERROR',
      );
    }

    if (!data) {
      throw new AppError(
        502,
        'پاسخ 3x-ui معتبر نیست',
        'THREEXUI_INVALID_RESPONSE',
      );
    }

    return data as T;
  }

  async testConnection(
    server: ThreeXUIServerRow,
  ) {
    const inbounds = await this.listInbounds(server);

    return {
      ok: true,
      inboundsCount: inbounds.length,
    };
  }

  async listInbounds(
    server: ThreeXUIServerRow,
  ): Promise<ThreeXUIInbound[]> {
    const data =
      await this.request<
        ThreeXUIResponse<ThreeXUIInbound[]>
      >(
        server,
        '/panel/api/inbounds/list',
      );

    if (data.success === false) {
      throw new AppError(
        502,
        data.msg || 'دریافت اینباندها ناموفق بود',
        'THREEXUI_FAILED',
      );
    }

    return Array.isArray(data.obj) ? data.obj : [];
  }

  async listInboundsWithTraffic(
    server: ThreeXUIServerRow,
    ttlMs = 60_000,
  ): Promise<ThreeXUIInbound[]> {
    const cached =
      this.trafficCacheByServerId.get(server.id);

    if (
      cached &&
      cached.expiresAt > Date.now()
    ) {
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

  async addClient(
    server: ThreeXUIServerRow,
    inboundId: number,
    client: any,
  ) {
    const payload = {
      id: inboundId,
      settings: JSON.stringify({
        clients: [client],
      }),
    };

    const data =
      await this.request<ThreeXUIResponse>(
        server,
        '/panel/api/inbounds/addClient',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        },
      );

    if (data.success === false) {
      throw new AppError(
        502,
        data.msg ||
          'ساخت کلاینت در 3x-ui ناموفق بود',
        'THREEXUI_ADD_CLIENT_FAILED',
      );
    }

    this.invalidateTrafficCache(server.id);

    return data;
  }

  async findClient(
    server: ThreeXUIServerRow,
    inboundId: number,
    clientId: string,
  ) {
    const inbounds =
      await this.listInbounds(server);

    const inbound = inbounds.find(
      (item) =>
        Number(item.id) === Number(inboundId),
    );

    if (!inbound) {
      throw new AppError(
        404,
        'اینباند در 3x-ui پیدا نشد',
        'THREEXUI_INBOUND_NOT_FOUND',
      );
    }

    const settings =
      safeJsonParse<any>(inbound.settings);

    const clients = Array.isArray(
      settings?.clients,
    )
      ? settings.clients
      : [];

    const client = clients.find(
      (item: any) =>
        String(item.id) === String(clientId),
    );

    if (!client) {
      throw new AppError(
        404,
        'کلاینت در 3x-ui پیدا نشد',
        'THREEXUI_CLIENT_NOT_FOUND',
      );
    }

    return { inbound, client };
  }

  async updateClient(
    server: ThreeXUIServerRow,
    inboundId: number,
    clientId: string,
    patch: Record<string, any>,
  ) {
    const found = await this.findClient(
      server,
      inboundId,
      clientId,
    );

    const updatedClient = {
      ...found.client,
      ...patch,
      id: clientId,
    };

    const payload = {
      id: inboundId,
      settings: JSON.stringify({
        clients: [updatedClient],
      }),
    };

    const data =
      await this.request<ThreeXUIResponse>(
        server,
        `/panel/api/inbounds/updateClient/${encodeURIComponent(clientId)}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        },
      );

    if (data.success === false) {
      throw new AppError(
        502,
        data.msg ||
          'آپدیت کلاینت در 3x-ui ناموفق بود',
        'THREEXUI_UPDATE_CLIENT_FAILED',
      );
    }

    this.invalidateTrafficCache(server.id);

    return data;
  }

  async deleteClient(
    server: ThreeXUIServerRow,
    inboundId: number,
    clientId: string,
  ) {
    const path =
      `/panel/api/inbounds/${Number(inboundId)}` +
      `/delClient/${encodeURIComponent(clientId)}`;

    const data =
      await this.request<ThreeXUIResponse>(
        server,
        path,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
        },
      );

    if (data.success === false) {
      throw new AppError(
        502,
        data.msg ||
          'حذف کلاینت در 3x-ui ناموفق بود',
        'THREEXUI_DELETE_CLIENT_FAILED',
      );
    }

    this.invalidateTrafficCache(server.id);

    return data;
  }
}

export const threeXUIService =
  new ThreeXUIService();
