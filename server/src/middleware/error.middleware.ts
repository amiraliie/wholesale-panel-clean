import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';

export class AppError extends Error {
  statusCode: number;
  code: string;

  constructor(statusCode: number, message: string, code = 'APP_ERROR') {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

type ErrorDetails = {
  name: string;
  message: string;
  code?: string;
  detail?: string;
  hint?: string;
  table?: string;
  column?: string;
  constraint?: string;
  cause?: unknown;
  stack?: string;
};

function getString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function normalizeCause(cause: unknown): unknown {
  if (cause instanceof Error) {
    const record = cause as Error & { code?: unknown };

    return {
      name: cause.name,
      message: cause.message,
      code: getString(record.code),
      stack: cause.stack,
    };
  }

  if (typeof cause === 'object' && cause !== null) {
    const record = cause as Record<string, unknown>;

    return {
      name: getString(record.name),
      message: getString(record.message),
      code: getString(record.code),
      detail: getString(record.detail),
    };
  }

  return cause === undefined ? undefined : String(cause);
}

function getErrorDetails(error: unknown): ErrorDetails {
  const nativeError = error instanceof Error ? error : undefined;
  const record =
    typeof error === 'object' && error !== null
      ? (error as Record<string, unknown>)
      : {};

  return {
    name: nativeError?.name || 'UnknownError',
    message: nativeError?.message || String(error),
    code: getString(record.code),
    detail: getString(record.detail),
    hint: getString(record.hint),
    table: getString(record.table),
    column: getString(record.column),
    constraint: getString(record.constraint),
    cause: normalizeCause(record.cause),
    stack: nativeError?.stack,
  };
}

function formatError(details: ErrorDetails): string {
  const lines = [`${details.name}: ${details.message}`];

  if (details.code) lines.push(`code: ${details.code}`);
  if (details.detail) lines.push(`detail: ${details.detail}`);
  if (details.hint) lines.push(`hint: ${details.hint}`);
  if (details.table) lines.push(`table: ${details.table}`);
  if (details.column) lines.push(`column: ${details.column}`);
  if (details.constraint) lines.push(`constraint: ${details.constraint}`);

  if (details.cause) {
    lines.push(`cause: ${JSON.stringify(details.cause, null, 2)}`);
  }

  if (details.stack) {
    lines.push('', details.stack);
  }

  return lines.join('\n');
}

function translateZodIssue(issue: ZodError['issues'][number]): string {
  const field = issue.path.join('.') || 'field';

  if (
    issue.code === 'invalid_string' &&
    'validation' in issue &&
    issue.validation === 'email'
  ) {
    return `${field}: ایمیل معتبر نیست`;
  }

  if (issue.code === 'too_small') {
    return `${field}: مقدار واردشده کوتاه است`;
  }

  if (issue.code === 'invalid_type') {
    return `${field}: نوع مقدار نامعتبر است`;
  }

  return `${field}: مقدار نامعتبر است`;
}

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(
    new AppError(
      404,
      `مسیر ${req.originalUrl} پیدا نشد`,
      'NOT_FOUND',
    ),
  );
};

export const errorHandler: ErrorRequestHandler = (
  error,
  req,
  res,
  _next,
) => {
  const debugEnabled =
    process.env.DEBUG_ERROR_DETAILS === 'true';

  if (error instanceof ZodError) {
    return res.status(400).json({
      ok: false,
      error: error.issues.map(translateZodIssue).join('، '),
      code: 'VALIDATION_ERROR',
      details: error.issues.map((issue) => ({
        path: issue.path,
        code: issue.code,
        message: issue.message,
      })),
      ...(debugEnabled ? { stack: error.stack } : {}),
    });
  }

  if (error instanceof AppError) {
    return res.status(error.statusCode).json({
      ok: false,
      error: error.message,
      code: error.code,
      ...(debugEnabled
        ? { details: getErrorDetails(error) }
        : {}),
    });
  }

  const details = getErrorDetails(error);

  console.error({
    method: req.method,
    path: req.originalUrl,
    error: details,
  });

  return res.status(500).json({
    ok: false,
    error: debugEnabled
      ? formatError(details)
      : 'خطای داخلی سرور',
    code: details.code || 'INTERNAL_ERROR',
    ...(debugEnabled ? { details } : {}),
  });
};
