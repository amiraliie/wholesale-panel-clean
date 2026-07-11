BEGIN;

ALTER TABLE wholesale_customers
  ADD COLUMN IF NOT EXISTS telegram_id VARCHAR(64);

CREATE TABLE IF NOT EXISTS bank_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    bank_name VARCHAR(100) NOT NULL,
    owner_name VARCHAR(150) NOT NULL,
    card_number VARCHAR(32),
    account_number VARCHAR(64),
    iban VARCHAR(34),
    is_active BOOLEAN NOT NULL DEFAULT true,
    sort_order INT NOT NULL DEFAULT 0,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT bank_accounts_has_payment_identifier CHECK (
      NULLIF(BTRIM(COALESCE(card_number, '')), '') IS NOT NULL
      OR NULLIF(BTRIM(COALESCE(account_number, '')), '') IS NOT NULL
      OR NULLIF(BTRIM(COALESCE(iban, '')), '') IS NOT NULL
    )
);

CREATE INDEX IF NOT EXISTS idx_bank_accounts_active
  ON bank_accounts(is_active, sort_order);

CREATE TABLE IF NOT EXISTS wallet_topup_invoices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    invoice_number VARCHAR(40) UNIQUE NOT NULL,
    wholesale_customer_id UUID NOT NULL
      REFERENCES wholesale_customers(id) ON DELETE CASCADE,

    requested_amount BIGINT NOT NULL CHECK (requested_amount > 0),
    approved_amount BIGINT CHECK (approved_amount > 0),

    telegram_id VARCHAR(64) NOT NULL,
    payment_method VARCHAR(32) NOT NULL DEFAULT 'bank_transfer'
      CHECK (payment_method IN ('bank_transfer')),

    status VARCHAR(24) NOT NULL DEFAULT 'unpaid'
      CHECK (
        status IN (
          'unpaid',
          'under_review',
          'approved',
          'rejected',
          'cancelled'
        )
      ),

    customer_snapshot JSONB NOT NULL DEFAULT '{}',
    admin_note TEXT,

    reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wallet_topups_customer
  ON wallet_topup_invoices(wholesale_customer_id);

CREATE INDEX IF NOT EXISTS idx_wallet_topups_status
  ON wallet_topup_invoices(status);

CREATE INDEX IF NOT EXISTS idx_wallet_topups_created
  ON wallet_topup_invoices(created_at DESC);

CREATE TABLE IF NOT EXISTS payment_receipts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    invoice_id UUID UNIQUE NOT NULL
      REFERENCES wallet_topup_invoices(id) ON DELETE CASCADE,

    bank_account_id UUID NOT NULL
      REFERENCES bank_accounts(id) ON DELETE RESTRICT,

    amount BIGINT NOT NULL CHECK (amount > 0),

    payment_type VARCHAR(32) NOT NULL
      CHECK (
        payment_type IN (
          'card_to_card',
          'paya_satna',
          'account_deposit'
        )
      ),

    tracking_code VARCHAR(100) NOT NULL,
    payment_date DATE NOT NULL,
    description TEXT,

    bank_account_snapshot JSONB NOT NULL DEFAULT '{}',

    original_filename VARCHAR(255) NOT NULL,
    stored_filename VARCHAR(255) UNIQUE NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    size_bytes BIGINT NOT NULL CHECK (size_bytes > 0),

    submitted_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_receipts_invoice
  ON payment_receipts(invoice_id);

CREATE INDEX IF NOT EXISTS idx_payment_receipts_tracking
  ON payment_receipts(tracking_code);

CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_receipts_bank_tracking
  ON payment_receipts(
    bank_account_id,
    tracking_code,
    payment_date,
    amount
  );

COMMIT;
