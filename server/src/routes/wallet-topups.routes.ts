import { mkdirSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import type {
  NextFunction,
  Request,
  Response,
} from 'express';
import multer from 'multer';
import { z } from 'zod';
import { env } from '../config/env.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { requireRole } from '../middleware/rbac.middleware.js';
import { asyncHandler } from '../utils/async-handler.js';
import { AppError } from '../middleware/error.middleware.js';
import type { AuthenticatedRequest } from '../types/index.js';
import {
  approveTopup,
  createTopupInvoice,
  getReceiptFile,
  getTopupInvoice,
  listAdminTopups,
  listCustomerTopups,
  rejectTopup,
  submitReceipt,
} from '../services/wallet-topup.service.js';

export const walletTopupsRoutes = Router();

const receiptDirectory = path.resolve(env.RECEIPT_UPLOAD_DIR);
mkdirSync(receiptDirectory, { recursive: true, mode: 0o750 });

const mimeExtensions: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'application/pdf': '.pdf',
};

const upload = multer({
  storage: multer.diskStorage({
    destination: receiptDirectory,
    filename: (_req, file, callback) => {
      const extension = mimeExtensions[file.mimetype] || '';
      callback(null, `${randomUUID()}${extension}`);
    },
  }),
  limits: {
    fileSize: 8 * 1024 * 1024,
    files: 1,
  },
  fileFilter: (_req, file, callback) => {
    if (!mimeExtensions[file.mimetype]) {
      callback(
        new AppError(
          400,
          'فقط تصویر JPG، PNG، WEBP یا فایل PDF مجاز است',
          'INVALID_RECEIPT_FILE',
        ),
      );
      return;
    }

    callback(null, true);
  },
});

async function hasValidReceiptSignature(
  filePath: string,
  mimeType: string,
) {
  const handle = await fs.open(filePath, 'r');

  try {
    const buffer = Buffer.alloc(16);
    const result = await handle.read(
      buffer,
      0,
      buffer.length,
      0,
    );

    const bytes = buffer.subarray(0, result.bytesRead);

    if (mimeType === 'image/jpeg') {
      return (
        bytes.length >= 3 &&
        bytes[0] === 0xff &&
        bytes[1] === 0xd8 &&
        bytes[2] === 0xff
      );
    }

    if (mimeType === 'image/png') {
      return (
        bytes.length >= 8 &&
        bytes.subarray(0, 8).equals(
          Buffer.from([
            0x89, 0x50, 0x4e, 0x47,
            0x0d, 0x0a, 0x1a, 0x0a,
          ]),
        )
      );
    }

    if (mimeType === 'image/webp') {
      return (
        bytes.length >= 12 &&
        bytes.subarray(0, 4).toString('ascii') === 'RIFF' &&
        bytes.subarray(8, 12).toString('ascii') === 'WEBP'
      );
    }

    if (mimeType === 'application/pdf') {
      return bytes.subarray(0, 5).toString('ascii') === '%PDF-';
    }

    return false;
  } finally {
    await handle.close();
  }
}

function uploadReceipt(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  upload.single('receipt')(req, res, (error) => {
    if (error instanceof multer.MulterError) {
      if (error.code === 'LIMIT_FILE_SIZE') {
        next(
          new AppError(
            400,
            'حجم فایل رسید نباید بیشتر از ۸ مگابایت باشد',
            'RECEIPT_TOO_LARGE',
          ),
        );
        return;
      }

      next(
        new AppError(
          400,
          'فایل رسید قابل پردازش نیست',
          'INVALID_RECEIPT_UPLOAD',
        ),
      );
      return;
    }

    next(error);
  });
}

walletTopupsRoutes.use(authMiddleware);

walletTopupsRoutes.get(
  '/admin',
  requireRole('super_admin', 'admin'),
  asyncHandler(async (req, res) => {
    const status = typeof req.query.status === 'string'
      ? req.query.status
      : undefined;

    res.json({
      ok: true,
      data: await listAdminTopups(status),
    });
  }),
);

walletTopupsRoutes.get(
  '/mine',
  requireRole('wholesale'),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    if (!req.user?.wholesaleCustomerId) {
      throw new AppError(
        400,
        'حساب مشتری عمده یافت نشد',
        'CUSTOMER_REQUIRED',
      );
    }

    res.json({
      ok: true,
      data: await listCustomerTopups(
        req.user.wholesaleCustomerId,
      ),
    });
  }),
);

walletTopupsRoutes.post(
  '/',
  requireRole('wholesale'),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    if (!req.user?.wholesaleCustomerId) {
      throw new AppError(
        400,
        'حساب مشتری عمده یافت نشد',
        'CUSTOMER_REQUIRED',
      );
    }

    const input = z.object({
      amount: z.coerce.number().int().min(10_000).max(10_000_000_000),
      telegramId: z.string().trim().min(2).max(64),
    }).parse(req.body);

    res.status(201).json({
      ok: true,
      data: await createTopupInvoice(
        req.user.wholesaleCustomerId,
        req.user.id,
        input.amount,
        input.telegramId,
      ),
    });
  }),
);

walletTopupsRoutes.post(
  '/:id/receipt',
  requireRole('wholesale'),
  uploadReceipt,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    if (!req.user?.wholesaleCustomerId) {
      throw new AppError(
        400,
        'حساب مشتری عمده یافت نشد',
        'CUSTOMER_REQUIRED',
      );
    }

    if (!req.file) {
      throw new AppError(
        400,
        'تصویر یا فایل رسید الزامی است',
        'RECEIPT_REQUIRED',
      );
    }

    try {
      const validSignature = await hasValidReceiptSignature(
        req.file.path,
        req.file.mimetype,
      );

      if (!validSignature) {
        throw new AppError(
          400,
          'محتوای فایل رسید با فرمت انتخاب‌شده مطابقت ندارد',
          'INVALID_RECEIPT_CONTENT',
        );
      }

      const input = z.object({
        bankAccountId: z.string().uuid(),
        amount: z.coerce.number().int().positive(),
        paymentType: z.enum([
          'card_to_card',
          'paya_satna',
          'account_deposit',
        ]),
        trackingCode: z.string().trim().min(3).max(100),
        paymentDate: z.string().date(),
        description: z.string().trim().max(1000).optional(),
      }).parse(req.body);

      const result = await submitReceipt(
        String(req.params.id),
        req.user.wholesaleCustomerId,
        req.user.id,
        {
          ...input,
          originalFilename: req.file.originalname,
          storedFilename: req.file.filename,
          mimeType: req.file.mimetype,
          sizeBytes: req.file.size,
        },
      );

      res.status(201).json({
        ok: true,
        data: result,
      });
    } catch (error) {
      await fs.unlink(req.file.path).catch(() => undefined);
      throw error;
    }
  }),
);

walletTopupsRoutes.get(
  '/:id/receipt-file',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const isAdmin =
      req.user?.role === 'admin' ||
      req.user?.role === 'super_admin';

    const file = await getReceiptFile(
      String(req.params.id),
      {
        isAdmin,
        customerId: req.user?.wholesaleCustomerId,
      },
    );

    res.type(file.mime_type);
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${encodeURIComponent(file.original_filename)}"`,
    );

    res.sendFile(file.stored_filename, {
      root: receiptDirectory,
    });
  }),
);

walletTopupsRoutes.post(
  '/:id/approve',
  requireRole('super_admin', 'admin'),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const input = z.object({
      approvedAmount: z.coerce.number().int().positive(),
      adminNote: z.string().trim().max(1000).optional(),
    }).parse(req.body);

    res.json({
      ok: true,
      data: await approveTopup(
        String(req.params.id),
        input.approvedAmount,
        input.adminNote,
        req.user!.id,
      ),
    });
  }),
);

walletTopupsRoutes.post(
  '/:id/reject',
  requireRole('super_admin', 'admin'),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const input = z.object({
      adminNote: z.string().trim().min(3).max(1000),
    }).parse(req.body);

    res.json({
      ok: true,
      data: await rejectTopup(
        String(req.params.id),
        input.adminNote,
        req.user!.id,
      ),
    });
  }),
);

walletTopupsRoutes.get(
  '/:id',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const isAdmin =
      req.user?.role === 'admin' ||
      req.user?.role === 'super_admin';

    if (!isAdmin && !req.user?.wholesaleCustomerId) {
      throw new AppError(
        403,
        'دسترسی به این فاکتور مجاز نیست',
        'FORBIDDEN',
      );
    }

    res.json({
      ok: true,
      data: await getTopupInvoice(
        String(req.params.id),
        isAdmin
          ? undefined
          : req.user!.wholesaleCustomerId!,
      ),
    });
  }),
);
