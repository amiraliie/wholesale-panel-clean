import fs from 'node:fs/promises';
import path from 'node:path';
import { nanoid } from 'nanoid';
import { env } from '../config/env.js';
import { query, transaction } from '../db/pool.js';
import { AppError } from '../middleware/error.middleware.js';
import { audit } from './audit.service.js';

export interface BankAccountInput {
  bankName: string;
  ownerName: string;
  cardNumber?: string | null;
  accountNumber?: string | null;
  iban?: string | null;
  isActive?: boolean;
  sortOrder?: number;
}

export interface ReceiptInput {
  bankAccountId: string;
  amount: number;
  paymentType: 'card_to_card' | 'paya_satna' | 'account_deposit';
  trackingCode: string;
  paymentDate: string;
  description?: string;
  originalFilename: string;
  storedFilename: string;
  mimeType: string;
  sizeBytes: number;
}

function createInvoiceNumber() {
  const date = new Date().toISOString().slice(0, 10).replaceAll('-', '');
  return `TOP-${date}-${nanoid(8).toUpperCase()}`;
}

export async function listBankAccounts(includeInactive = false) {
  const result = await query<any>(
    `SELECT *
     FROM bank_accounts
     ${includeInactive ? '' : 'WHERE is_active = true'}
     ORDER BY sort_order ASC, created_at ASC`,
  );

  return result.rows;
}

export async function createBankAccount(
  input: BankAccountInput,
  userId: string,
) {
  const result = await query<any>(
    `INSERT INTO bank_accounts
      (
        bank_name,
        owner_name,
        card_number,
        account_number,
        iban,
        is_active,
        sort_order,
        created_by
      )
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     RETURNING *`,
    [
      input.bankName,
      input.ownerName,
      input.cardNumber || null,
      input.accountNumber || null,
      input.iban || null,
      input.isActive ?? true,
      input.sortOrder ?? 0,
      userId,
    ],
  );

  const account = result.rows[0];

  await audit(
    userId,
    'bank_account.create',
    'bank_account',
    account.id,
    account,
  );

  return account;
}

export async function updateBankAccount(
  id: string,
  input: Partial<BankAccountInput>,
  userId: string,
) {
  const fields: string[] = [];
  const params: unknown[] = [];

  function add(name: string, value: unknown) {
    params.push(value);
    fields.push(`${name} = $${params.length}`);
  }

  if (input.bankName !== undefined) add('bank_name', input.bankName);
  if (input.ownerName !== undefined) add('owner_name', input.ownerName);
  if (input.cardNumber !== undefined) add('card_number', input.cardNumber || null);
  if (input.accountNumber !== undefined) add('account_number', input.accountNumber || null);
  if (input.iban !== undefined) add('iban', input.iban || null);
  if (input.isActive !== undefined) add('is_active', input.isActive);
  if (input.sortOrder !== undefined) add('sort_order', input.sortOrder);

  if (!fields.length) {
    throw new AppError(400, 'اطلاعاتی برای ویرایش ارسال نشده است', 'EMPTY_UPDATE');
  }

  params.push(id);

  const result = await query<any>(
    `UPDATE bank_accounts
     SET ${fields.join(', ')}, updated_at = NOW()
     WHERE id = $${params.length}
     RETURNING *`,
    params,
  );

  const account = result.rows[0];

  if (!account) {
    throw new AppError(404, 'حساب بانکی یافت نشد', 'BANK_ACCOUNT_NOT_FOUND');
  }

  await audit(
    userId,
    'bank_account.update',
    'bank_account',
    account.id,
    account,
  );

  return account;
}

export async function archiveBankAccount(id: string, userId: string) {
  const result = await query<any>(
    `UPDATE bank_accounts
     SET is_active = false, updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [id],
  );

  const account = result.rows[0];

  if (!account) {
    throw new AppError(404, 'حساب بانکی یافت نشد', 'BANK_ACCOUNT_NOT_FOUND');
  }

  await audit(
    userId,
    'bank_account.archive',
    'bank_account',
    account.id,
    account,
  );

  return account;
}

export async function createTopupInvoice(
  customerId: string,
  userId: string,
  requestedAmount: number,
  telegramId: string,
) {
  const invoice = await transaction(async (client) => {
    const customerResult = await client.query<any>(
      `SELECT
        wc.id,
        wc.company_name,
        wc.phone,
        u.username,
        u.email
       FROM wholesale_customers wc
       JOIN users u ON u.id = wc.user_id
       WHERE wc.id = $1
       FOR UPDATE`,
      [customerId],
    );

    const customer = customerResult.rows[0];

    if (!customer) {
      throw new AppError(404, 'مشتری عمده یافت نشد', 'CUSTOMER_NOT_FOUND');
    }

    await client.query(
      `UPDATE wholesale_customers
       SET telegram_id = $1, updated_at = NOW()
       WHERE id = $2`,
      [telegramId, customerId],
    );

    const result = await client.query<any>(
      `INSERT INTO wallet_topup_invoices
        (
          invoice_number,
          wholesale_customer_id,
          requested_amount,
          telegram_id,
          customer_snapshot
        )
       VALUES ($1,$2,$3,$4,$5)
       RETURNING *`,
      [
        createInvoiceNumber(),
        customerId,
        requestedAmount,
        telegramId,
        JSON.stringify(customer),
      ],
    );

    return result.rows[0];
  });

  await audit(
    userId,
    'wallet_topup.create',
    'wallet_topup_invoice',
    invoice.id,
    {
      invoiceNumber: invoice.invoice_number,
      requestedAmount,
    },
  );

  return getTopupInvoice(invoice.id, customerId);
}

export async function listCustomerTopups(customerId: string) {
  const result = await query<any>(
    `SELECT
      wti.*,
      pr.id AS receipt_id,
      pr.tracking_code,
      pr.payment_date,
      pr.created_at AS receipt_created_at
     FROM wallet_topup_invoices wti
     LEFT JOIN payment_receipts pr ON pr.invoice_id = wti.id
     WHERE wti.wholesale_customer_id = $1
     ORDER BY wti.created_at DESC`,
    [customerId],
  );

  return result.rows;
}

export async function listAdminTopups(status?: string) {
  const params: unknown[] = [];
  let where = '';

  if (status) {
    params.push(status);
    where = 'WHERE wti.status = $1';
  }

  const result = await query<any>(
    `SELECT
      wti.*,
      wc.company_name,
      wc.phone,
      u.username,
      u.email,
      pr.id AS receipt_id,
      pr.amount AS receipt_amount,
      pr.payment_type,
      pr.tracking_code,
      pr.payment_date,
      pr.description AS receipt_description,
      pr.mime_type,
      pr.size_bytes,
      pr.created_at AS receipt_created_at,
      pr.bank_account_id,
      COALESCE(
        pr.bank_account_snapshot->>'bank_name',
        ba.bank_name
      ) AS bank_name,
      COALESCE(
        pr.bank_account_snapshot->>'owner_name',
        ba.owner_name
      ) AS owner_name,
      COALESCE(
        pr.bank_account_snapshot->>'card_number',
        ba.card_number
      ) AS card_number,
      COALESCE(
        pr.bank_account_snapshot->>'account_number',
        ba.account_number
      ) AS account_number,
      COALESCE(
        pr.bank_account_snapshot->>'iban',
        ba.iban
      ) AS iban
     FROM wallet_topup_invoices wti
     JOIN wholesale_customers wc
       ON wc.id = wti.wholesale_customer_id
     JOIN users u ON u.id = wc.user_id
     LEFT JOIN payment_receipts pr ON pr.invoice_id = wti.id
     LEFT JOIN bank_accounts ba ON ba.id = pr.bank_account_id
     ${where}
     ORDER BY wti.created_at DESC
     LIMIT 500`,
    params,
  );

  return result.rows;
}

export async function getTopupInvoice(
  invoiceId: string,
  customerId?: string,
) {
  const params: unknown[] = [invoiceId];
  let customerFilter = '';

  if (customerId) {
    params.push(customerId);
    customerFilter = `AND wti.wholesale_customer_id = $2`;
  }

  const result = await query<any>(
    `SELECT
      wti.*,
      wc.company_name,
      wc.phone,
      u.username,
      u.email,

      pr.id AS receipt_id,
      pr.amount AS receipt_amount,
      pr.payment_type,
      pr.tracking_code,
      pr.payment_date,
      pr.description AS receipt_description,
      pr.original_filename,
      pr.mime_type,
      pr.size_bytes,
      pr.created_at AS receipt_created_at,

      pr.bank_account_id,
      COALESCE(
        pr.bank_account_snapshot->>'bank_name',
        ba.bank_name
      ) AS bank_name,
      COALESCE(
        pr.bank_account_snapshot->>'owner_name',
        ba.owner_name
      ) AS owner_name,
      COALESCE(
        pr.bank_account_snapshot->>'card_number',
        ba.card_number
      ) AS card_number,
      COALESCE(
        pr.bank_account_snapshot->>'account_number',
        ba.account_number
      ) AS account_number,
      COALESCE(
        pr.bank_account_snapshot->>'iban',
        ba.iban
      ) AS iban
     FROM wallet_topup_invoices wti
     JOIN wholesale_customers wc
       ON wc.id = wti.wholesale_customer_id
     JOIN users u ON u.id = wc.user_id
     LEFT JOIN payment_receipts pr ON pr.invoice_id = wti.id
     LEFT JOIN bank_accounts ba ON ba.id = pr.bank_account_id
     WHERE wti.id = $1
     ${customerFilter}`,
    params,
  );

  const invoice = result.rows[0];

  if (!invoice) {
    throw new AppError(404, 'فاکتور شارژ یافت نشد', 'TOPUP_INVOICE_NOT_FOUND');
  }

  return invoice;
}

export async function submitReceipt(
  invoiceId: string,
  customerId: string,
  userId: string,
  input: ReceiptInput,
) {
  const previousStoredFilename = await transaction(
    async (client): Promise<string | null> => {
      const invoiceResult = await client.query<any>(
        `SELECT *
         FROM wallet_topup_invoices
         WHERE id = $1 AND wholesale_customer_id = $2
         FOR UPDATE`,
        [invoiceId, customerId],
      );

      const invoice = invoiceResult.rows[0];

      if (!invoice) {
        throw new AppError(
          404,
          'فاکتور شارژ یافت نشد',
          'TOPUP_INVOICE_NOT_FOUND',
        );
      }

      if (!['unpaid', 'rejected'].includes(invoice.status)) {
        throw new AppError(
          400,
          'این فاکتور در حال بررسی یا قبلاً تأیید شده است',
          'TOPUP_NOT_EDITABLE',
        );
      }

      const bankResult = await client.query<any>(
        `SELECT *
         FROM bank_accounts
         WHERE id = $1 AND is_active = true`,
        [input.bankAccountId],
      );

      const bankAccount = bankResult.rows[0];

      if (!bankAccount) {
        throw new AppError(
          404,
          'حساب بانکی انتخاب‌شده فعال نیست',
          'BANK_ACCOUNT_NOT_FOUND',
        );
      }

      const previousReceiptResult = await client.query<any>(
        `SELECT stored_filename
         FROM payment_receipts
         WHERE invoice_id = $1
         FOR UPDATE`,
        [invoiceId],
      );

      const oldFilename =
        previousReceiptResult.rows[0]?.stored_filename || null;

      await client.query(
        `INSERT INTO payment_receipts
          (
            invoice_id,
            bank_account_id,
            amount,
            payment_type,
            tracking_code,
            payment_date,
            description,
            bank_account_snapshot,
            original_filename,
            stored_filename,
            mime_type,
            size_bytes,
            submitted_by
          )
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         ON CONFLICT (invoice_id)
         DO UPDATE SET
           bank_account_id = EXCLUDED.bank_account_id,
           amount = EXCLUDED.amount,
           payment_type = EXCLUDED.payment_type,
           tracking_code = EXCLUDED.tracking_code,
           payment_date = EXCLUDED.payment_date,
           description = EXCLUDED.description,
           bank_account_snapshot = EXCLUDED.bank_account_snapshot,
           original_filename = EXCLUDED.original_filename,
           stored_filename = EXCLUDED.stored_filename,
           mime_type = EXCLUDED.mime_type,
           size_bytes = EXCLUDED.size_bytes,
           submitted_by = EXCLUDED.submitted_by,
           updated_at = NOW()`,
        [
          invoiceId,
          input.bankAccountId,
          input.amount,
          input.paymentType,
          input.trackingCode,
          input.paymentDate,
          input.description || null,
          JSON.stringify(bankAccount),
          input.originalFilename,
          input.storedFilename,
          input.mimeType,
          input.sizeBytes,
          userId,
        ],
      );

      await client.query(
        `UPDATE wallet_topup_invoices
         SET status = 'under_review',
             admin_note = NULL,
             updated_at = NOW()
         WHERE id = $1`,
        [invoiceId],
      );

      return oldFilename;
    },
  );

  if (
    previousStoredFilename &&
    previousStoredFilename !== input.storedFilename
  ) {
    const previousPath = path.join(
      path.resolve(env.RECEIPT_UPLOAD_DIR),
      path.basename(previousStoredFilename),
    );

    await fs.unlink(previousPath).catch(() => undefined);
  }

  await audit(
    userId,
    'wallet_topup.receipt_submitted',
    'wallet_topup_invoice',
    invoiceId,
    {
      amount: input.amount,
      trackingCode: input.trackingCode,
    },
  );

  return getTopupInvoice(invoiceId, customerId);
}

export async function approveTopup(
  invoiceId: string,
  approvedAmount: number,
  adminNote: string | undefined,
  adminId: string,
) {
  const result = await transaction(async (client) => {
    const invoiceResult = await client.query<any>(
      `SELECT *
       FROM wallet_topup_invoices
       WHERE id = $1
       FOR UPDATE`,
      [invoiceId],
    );

    const invoice = invoiceResult.rows[0];

    if (!invoice) {
      throw new AppError(404, 'فاکتور شارژ یافت نشد', 'TOPUP_INVOICE_NOT_FOUND');
    }

    if (invoice.status === 'approved') {
      throw new AppError(
        400,
        'این فاکتور قبلاً تأیید و شارژ شده است',
        'TOPUP_ALREADY_APPROVED',
      );
    }

    if (invoice.status !== 'under_review') {
      throw new AppError(
        400,
        'فاکتور هنوز رسید قابل بررسی ندارد',
        'TOPUP_NOT_REVIEWABLE',
      );
    }

    const receiptResult = await client.query<any>(
      `SELECT id
       FROM payment_receipts
       WHERE invoice_id = $1`,
      [invoiceId],
    );

    if (!receiptResult.rows[0]) {
      throw new AppError(
        400,
        'برای این فاکتور رسیدی ثبت نشده است',
        'RECEIPT_NOT_FOUND',
      );
    }

    const walletResult = await client.query<any>(
      `SELECT *
       FROM wallets
       WHERE wholesale_customer_id = $1
       FOR UPDATE`,
      [invoice.wholesale_customer_id],
    );

    const wallet = walletResult.rows[0];

    if (!wallet) {
      throw new AppError(404, 'کیف پول یافت نشد', 'WALLET_NOT_FOUND');
    }

    const balanceBefore = Number(wallet.balance);
    const balanceAfter = balanceBefore + approvedAmount;
    const idempotencyKey = `wallet-topup:${invoiceId}`;

    await client.query(
      `UPDATE wallets
       SET balance = $1, updated_at = NOW()
       WHERE id = $2`,
      [balanceAfter, wallet.id],
    );

    const txResult = await client.query<any>(
      `INSERT INTO wallet_transactions
        (
          wallet_id,
          type,
          amount,
          balance_before,
          balance_after,
          description,
          created_by,
          status,
          idempotency_key,
          metadata
        )
       VALUES ($1,'credit',$2,$3,$4,$5,$6,'completed',$7,$8)
       RETURNING *`,
      [
        wallet.id,
        approvedAmount,
        balanceBefore,
        balanceAfter,
        `شارژ کیف پول بابت فاکتور ${invoice.invoice_number}`,
        adminId,
        idempotencyKey,
        JSON.stringify({
          walletTopupInvoiceId: invoiceId,
          invoiceNumber: invoice.invoice_number,
        }),
      ],
    );

    await client.query(
      `UPDATE wallet_topup_invoices
       SET status = 'approved',
           approved_amount = $1,
           admin_note = $2,
           reviewed_by = $3,
           reviewed_at = NOW(),
           updated_at = NOW()
       WHERE id = $4`,
      [approvedAmount, adminNote || null, adminId, invoiceId],
    );

    return txResult.rows[0];
  });

  await audit(
    adminId,
    'wallet_topup.approve',
    'wallet_topup_invoice',
    invoiceId,
    {
      approvedAmount,
      transactionId: result.id,
    },
  );

  return {
    invoice: await getTopupInvoice(invoiceId),
    transaction: result,
  };
}

export async function rejectTopup(
  invoiceId: string,
  adminNote: string,
  adminId: string,
) {
  const result = await query<any>(
    `UPDATE wallet_topup_invoices
     SET status = 'rejected',
         admin_note = $1,
         reviewed_by = $2,
         reviewed_at = NOW(),
         updated_at = NOW()
     WHERE id = $3
       AND status = 'under_review'
     RETURNING *`,
    [adminNote, adminId, invoiceId],
  );

  if (!result.rows[0]) {
    throw new AppError(
      400,
      'فاکتور قابل ردکردن نیست',
      'TOPUP_NOT_REVIEWABLE',
    );
  }

  await audit(
    adminId,
    'wallet_topup.reject',
    'wallet_topup_invoice',
    invoiceId,
    { adminNote },
  );

  return getTopupInvoice(invoiceId);
}

export async function getReceiptFile(
  invoiceId: string,
  options: {
    isAdmin: boolean;
    customerId?: string | null;
  },
) {
  const params: unknown[] = [invoiceId];
  let ownerFilter = '';

  if (!options.isAdmin) {
    if (!options.customerId) {
      throw new AppError(403, 'دسترسی غیرمجاز است', 'FORBIDDEN');
    }

    params.push(options.customerId);
    ownerFilter = `AND wti.wholesale_customer_id = $2`;
  }

  const result = await query<any>(
    `SELECT
      pr.stored_filename,
      pr.original_filename,
      pr.mime_type
     FROM payment_receipts pr
     JOIN wallet_topup_invoices wti ON wti.id = pr.invoice_id
     WHERE pr.invoice_id = $1
     ${ownerFilter}`,
    params,
  );

  const file = result.rows[0];

  if (!file) {
    throw new AppError(404, 'فایل رسید یافت نشد', 'RECEIPT_FILE_NOT_FOUND');
  }

  return file;
}
