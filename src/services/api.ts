export interface ApiEnvelope<T> {
  ok: boolean;
  data?: T;
  error?: string;
  code?: string;
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

export class ApiError extends Error {
  constructor(message: string, public status: number, public code?: string) {
    super(message);
  }
}

function camelKey(key: string) {
  return key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

export function camelize<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => camelize(item)) as T;
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, val]) => [camelKey(key), camelize(val)])
    ) as T;
  }
  return value;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const isFormData = options.body instanceof FormData;
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      ...(options.headers || {}),
    },
  });

  const contentType = res.headers.get('content-type') || '';
  const body = contentType.includes('application/json') ? await res.json() : await res.text();

  if (!res.ok) {
    const message = typeof body === 'object' && body !== null
      ? (body.error || body.message || 'خطا در ارتباط با سرور')
      : String(body || 'خطا در ارتباط با سرور');
    throw new ApiError(message, res.status, typeof body === 'object' && body !== null ? body.code : undefined);
  }

  if (typeof body === 'object' && body !== null && 'ok' in body) {
    const envelope = body as ApiEnvelope<T>;
    if (!envelope.ok) throw new ApiError(envelope.error || 'درخواست ناموفق بود', res.status, envelope.code);
    return camelize(envelope.data as T);
  }

  return camelize(body as T);
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, data?: unknown) => request<T>(path, { method: 'POST', body: data === undefined ? undefined : JSON.stringify(data) }),
  put: <T>(path: string, data?: unknown) => request<T>(path, { method: 'PUT', body: data === undefined ? undefined : JSON.stringify(data) }),
  patch: <T>(path: string, data?: unknown) => request<T>(path, { method: 'PATCH', body: data === undefined ? undefined : JSON.stringify(data) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};
