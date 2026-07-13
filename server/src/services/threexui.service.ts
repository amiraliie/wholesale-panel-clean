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

type ThreeXUIClientApiMode =
  | 'legacy'
  | 'clients_v3';

export interface ThreeXUIClientTarget {
  email: string;
  clientId: string;
  inboundIds: number[];
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

  private clientApiModeByServerId = new Map<
    string,
    ThreeXUIClientApiMode
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

  private async authenticatedFetch(
    server: ThreeXUIServerRow,
    path: string,
    init: RequestInit = {},
    retry = true,
  ): Promise<{
    response: Response;
    data: ThreeXUIResponse<any> | null;
  }> {
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

      return this.authenticatedFetch(
        server,
        path,
        init,
        false,
      );
    }

    const data = await readResponseJson(response);

    return { response, data };
  }

  private async request<T>(
    server: ThreeXUIServerRow,
    path: string,
    init: RequestInit = {},
    retry = true,
  ): Promise<T> {
    const { response, data } =
      await this.authenticatedFetch(
        server,
        path,
        init,
        retry,
      );

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

  private async detectClientApiMode(
    server: ThreeXUIServerRow,
  ): Promise<ThreeXUIClientApiMode> {
    const cached =
      this.clientApiModeByServerId.get(server.id);

    if (cached) {
      return cached;
    }

    const { response, data } =
      await this.authenticatedFetch(
        server,
        '/panel/api/clients/list',
      );

    const mode: ThreeXUIClientApiMode =
      response.status === 404
        ? 'legacy'
        : 'clients_v3';

    if (
      mode === 'clients_v3' &&
      !response.ok
    ) {
      throw new AppError(
        502,
        data?.msg ||
          `تشخیص API کلاینت ناموفق بود (${response.status})`,
        'THREEXUI_CLIENT_API_DETECTION_FAILED',
      );
    }

    this.clientApiModeByServerId.set(
      server.id,
      mode,
    );

    return mode;
  }

  async getClientApiMode(
    server: ThreeXUIServerRow,
  ): Promise<'legacy' | 'clients_v3'> {
    return this.detectClientApiMode(server);
  }

  async testConnection(
    server: ThreeXUIServerRow,
  ) {
    const inbounds = await this.listInbounds(server);
    const clientApiMode =
      await this.detectClientApiMode(server);

    return {
      ok: true,
      inboundsCount: inbounds.length,
      clientApiMode,
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

  private normalizeInboundIds(
    inboundIds: number | number[],
  ): number[] {
    const values = Array.isArray(inboundIds)
      ? inboundIds
      : [inboundIds];

    const normalized = [
      ...new Set(
        values
          .map(Number)
          .filter(
            (value) =>
              Number.isInteger(value) && value > 0,
          ),
      ),
    ];

    if (!normalized.length) {
      throw new AppError(
        400,
        'حداقل یک اینباند معتبر لازم است',
        'THREEXUI_INBOUND_REQUIRED',
      );
    }

    return normalized;
  }

  private normalizeV3Client(client: any) {
    const clientId =
      typeof client.uuid === 'string' &&
      client.uuid.trim()
        ? client.uuid.trim()
        : typeof client.id === 'string'
          ? client.id.trim()
          : '';

    let allowedIPs: string[] | undefined;

    if (Array.isArray(client.allowedIPs)) {
      allowedIPs = client.allowedIPs
        .map((value: unknown) => String(value).trim())
        .filter(Boolean);
    } else if (
      typeof client.allowedIPs === 'string' &&
      client.allowedIPs.trim()
    ) {
      const parsed =
        safeJsonParse<unknown>(client.allowedIPs);

      allowedIPs = Array.isArray(parsed)
        ? parsed
            .map((value: unknown) =>
              String(value).trim(),
            )
            .filter(Boolean)
        : client.allowedIPs
            .split(',')
            .map((value: string) => value.trim())
            .filter(Boolean);
    }

    const reverse =
      typeof client.reverse === 'string'
        ? safeJsonParse(client.reverse)
        : client.reverse;

    const normalized: Record<string, unknown> = {
      security: String(client.security || 'auto'),
      email: String(client.email || '').trim(),
      limitIp: Number(client.limitIp || 0),
      totalGB: Number(client.totalGB || 0),
      expiryTime: Number(client.expiryTime || 0),
      enable: client.enable !== false,
      tgId: Number(client.tgId || 0),
      subId: String(client.subId || ''),
      group: String(client.group || ''),
      comment: String(client.comment || ''),
      reset: Number(client.reset || 0),
    };

    if (clientId) normalized.id = clientId;
    if (client.password) {
      normalized.password = String(client.password);
    }
    if (client.flow) {
      normalized.flow = String(client.flow);
    }
    if (client.auth) {
      normalized.auth = String(client.auth);
    }
    if (reverse && typeof reverse === 'object') {
      normalized.reverse = reverse;
    }
    if (client.privateKey) {
      normalized.privateKey =
        String(client.privateKey);
    }
    if (client.publicKey) {
      normalized.publicKey =
        String(client.publicKey);
    }
    if (allowedIPs?.length) {
      normalized.allowedIPs = allowedIPs;
    }
    if (client.preSharedKey) {
      normalized.preSharedKey =
        String(client.preSharedKey);
    }
    if (client.keepAlive !== undefined) {
      normalized.keepAlive =
        Number(client.keepAlive || 0);
    }

    return normalized;
  }

  async addClient(
    server: ThreeXUIServerRow,
    inboundIds: number | number[],
    client: any,
  ) {
    const ids = this.normalizeInboundIds(inboundIds);
    const mode =
      await this.detectClientApiMode(server);

    if (mode === 'clients_v3') {
      const data =
        await this.request<ThreeXUIResponse>(
          server,
          '/panel/api/clients/add',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              client: this.normalizeV3Client(client),
              inboundIds: ids,
            }),
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

    if (ids.length > 1) {
      throw new AppError(
        400,
        'نسخه قدیمی 3x-ui فقط از یک اینباند برای هر کاربر پشتیبانی می‌کند',
        'THREEXUI_LEGACY_SINGLE_INBOUND',
      );
    }

    const payload = {
      id: ids[0],
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

  private async getV3Client(
    server: ThreeXUIServerRow,
    email: string,
  ) {
    const data =
      await this.request<
        ThreeXUIResponse<{
          client: any;
          inboundIds: number[];
          usedTraffic?: number;
        }>
      >(
        server,
        `/panel/api/clients/get/${encodeURIComponent(email)}`,
      );

    if (
      data.success === false ||
      !data.obj?.client
    ) {
      throw new AppError(
        404,
        data.msg ||
          'کلاینت در 3x-ui پیدا نشد',
        'THREEXUI_CLIENT_NOT_FOUND',
      );
    }

    return data.obj;
  }

  async listClientsWithTraffic(
    server: ThreeXUIServerRow,
  ): Promise<any[]> {
    const mode =
      await this.detectClientApiMode(server);

    if (mode !== 'clients_v3') {
      return [];
    }

    const data =
      await this.request<
        ThreeXUIResponse<any[]>
      >(
        server,
        '/panel/api/clients/list',
      );

    if (data.success === false) {
      throw new AppError(
        502,
        data.msg ||
          'دریافت فهرست کلاینت‌های 3x-ui ناموفق بود',
        'THREEXUI_CLIENT_LIST_FAILED',
      );
    }

    return Array.isArray(data.obj)
      ? data.obj
      : [];
  }

  async getClientLinks(
    server: ThreeXUIServerRow,
    email: string,
  ): Promise<string[]> {
    const mode =
      await this.detectClientApiMode(server);

    if (mode !== 'clients_v3') {
      return [];
    }

    const data =
      await this.request<
        ThreeXUIResponse<string[]>
      >(
        server,
        `/panel/api/clients/links/${encodeURIComponent(email)}`,
      );

    if (data.success === false) {
      throw new AppError(
        502,
        data.msg ||
          'دریافت لینک‌های کلاینت از 3x-ui ناموفق بود',
        'THREEXUI_CLIENT_LINKS_FAILED',
      );
    }

    const links = Array.isArray(data.obj)
      ? data.obj
          .map((value) => String(value).trim())
          .filter(Boolean)
      : [];

    if (!links.length) {
      throw new AppError(
        502,
        '3x-ui هیچ لینکی برای کلاینت ایجاد نکرد',
        'THREEXUI_CLIENT_LINKS_EMPTY',
      );
    }

    return links;
  }

  private async findLegacyClient(
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
      typeof inbound.settings === 'string'
        ? safeJsonParse<any>(inbound.settings)
        : inbound.settings as any;

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
    target: ThreeXUIClientTarget,
    patch: Record<string, any>,
  ) {
    const ids =
      this.normalizeInboundIds(target.inboundIds);

    const mode =
      await this.detectClientApiMode(server);

    if (mode === 'clients_v3') {
      const existing = await this.getV3Client(
        server,
        target.email,
      );

      const updatedClient =
        this.normalizeV3Client({
          ...existing.client,
          ...patch,
          uuid:
            existing.client.uuid ||
            (
              typeof existing.client.id === 'string'
                ? existing.client.id
                : target.clientId
            ),
          email: target.email,
        });

      const data =
        await this.request<ThreeXUIResponse>(
          server,
          `/panel/api/clients/update/${encodeURIComponent(target.email)}`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(updatedClient),
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

    const found = await this.findLegacyClient(
      server,
      ids[0],
      target.clientId,
    );

    const updatedClient = {
      ...found.client,
      ...patch,
      id: target.clientId,
    };

    const payload = {
      id: ids[0],
      settings: JSON.stringify({
        clients: [updatedClient],
      }),
    };

    const data =
      await this.request<ThreeXUIResponse>(
        server,
        `/panel/api/inbounds/updateClient/${encodeURIComponent(target.clientId)}`,
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
    target: ThreeXUIClientTarget,
  ) {
    const ids =
      this.normalizeInboundIds(target.inboundIds);

    const mode =
      await this.detectClientApiMode(server);

    if (mode === 'clients_v3') {
      const data =
        await this.request<ThreeXUIResponse>(
          server,
          `/panel/api/clients/del/${encodeURIComponent(target.email)}`,
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

    const path =
      `/panel/api/inbounds/${ids[0]}` +
      `/delClient/${encodeURIComponent(target.clientId)}`;

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
