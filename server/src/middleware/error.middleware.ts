import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';

export class AppError extends Error {
  statusCode: number;
  code: string;

  constructor(statusCode: number, message: string, code = 'APP_ERROR') {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

function translateZodIssue(issue: ZodError['issues'][number]): string {
  const field = issue.path.join('.') || 'field';

  if (issue.code === 'invalid_string' && 'validation' in issue && issue.validation === 'email') {
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
  next(new AppError(404, `مسیر ${req.originalUrl} پیدا نشد`, 'NOT_FOUND'));
};

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
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
    });
  }

  if (error instanceof AppError) {
    return res.status(error.statusCode).json({
      ok: false,
      error: error.message,
      code: error.code,
    });
  }

  console.error(error);

  return res.status(500).json({
    ok: false,
    error: 'خطای داخلی سرور',
    code: 'INTERNAL_ERROR',
  });
};
