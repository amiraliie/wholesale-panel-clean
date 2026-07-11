export interface ApiEnvelope<T> {
  ok: boolean;
  data?: T;
  error?: string;
  code?: string;
  details?: unknown;
  stack?: string;
}

type ApiErrorBody = {
  error?: unknown;
  message?: unknown;
  code?: unknown;
  details?: unknown;
  stack?: unknown;
};

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
    public details?: unknown,
    public responseBody?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function camelKey(key: string) {
  return key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

export function camelize<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => camelize(item)) as T;
  }

  if (value && typeof value === 'object' && !(value instanceof Date)) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(
        ([key, val]) => [camelKey(key), camelize(val)],
      ),
    ) as T;
  }

  return value;
}

function getErrorBody(body: unknown): ApiErrorBody {
  if (typeof body === 'object' && body !== null) {
    return body as ApiErrorBody;
  }

  return {};
}

function getString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim()
    ? value
    : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function formatErrorMessage(body: unknown): string {
  const errorBody = isRecord(body) ? body : {};

  return (
    getString(errorBody.error) ||
    getString(errorBody.message) ||
    'خطا در ارتباط با سرور'
  );
}

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
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

  const body = contentType.includes('application/json')
    ? await res.json()
    : await res.text();

  if (!res.ok) {
    const errorBody = getErrorBody(body);

    throw new ApiError(
      formatErrorMessage(body),
      res.status,
      getString(errorBody.code),
      errorBody.details,
      body,
    );
  }

  if (typeof body === 'object' && body !== null && 'ok' in body) {
    const envelope = body as ApiEnvelope<T>;

    if (!envelope.ok) {
      throw new ApiError(
        formatErrorMessage(envelope),
        res.status,
        envelope.code,
        envelope.details,
        envelope,
      );
    }

    return camelize(envelope.data as T);
  }

  return camelize(body as T);
}

export const api = {
  get: <T>(path: string) =>
    request<T>(path),

  post: <T>(path: string, data?: unknown) =>
    request<T>(path, {
      method: 'POST',
      body: data === undefined ? undefined : JSON.stringify(data),
    }),

  postForm: <T>(path: string, data: FormData) =>
    request<T>(path, {
      method: 'POST',
      body: data,
    }),

  put: <T>(path: string, data?: unknown) =>
    request<T>(path, {
      method: 'PUT',
      body: data === undefined ? undefined : JSON.stringify(data),
    }),

  patch: <T>(path: string, data?: unknown) =>
    request<T>(path, {
      method: 'PATCH',
      body: data === undefined ? undefined : JSON.stringify(data),
    }),

  delete: <T>(path: string) =>
    request<T>(path, { method: 'DELETE' }),
};
