-- نوع سرور: مستقیم یا تانل
ALTER TABLE servers
ADD COLUMN IF NOT EXISTS service_type VARCHAR(20)
NOT NULL DEFAULT 'direct';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'servers_service_type_check'
  ) THEN
    ALTER TABLE servers
    ADD CONSTRAINT servers_service_type_check
    CHECK (service_type IN ('direct', 'tunnel'));
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_servers_service_type
ON servers(service_type);

-- نوع پلن: عمومی یا اختصاصی سرور
ALTER TABLE plans
ADD COLUMN IF NOT EXISTS scope VARCHAR(20)
NOT NULL DEFAULT 'global';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'plans_scope_check'
  ) THEN
    ALTER TABLE plans
    ADD CONSTRAINT plans_scope_check
    CHECK (scope IN ('global', 'server'));
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_plans_scope
ON plans(scope);

-- اتصال پلن به سرور و Override قیمت/مشخصات
CREATE TABLE IF NOT EXISTS server_plan_offers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  server_id UUID NOT NULL
    REFERENCES servers(id) ON DELETE CASCADE,

  plan_id UUID NOT NULL
    REFERENCES plans(id) ON DELETE CASCADE,

  flat_price BIGINT,
  price_per_gb BIGINT,

  traffic_gb_override INT,
  duration_days_override INT,
  ip_limit_override INT,

  is_active BOOLEAN NOT NULL DEFAULT true,

  available_from TIMESTAMPTZ,
  available_until TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(server_id, plan_id),

  CHECK (
    flat_price IS NULL OR flat_price >= 0
  ),

  CHECK (
    price_per_gb IS NULL OR price_per_gb >= 0
  ),

  CHECK (
    traffic_gb_override IS NULL
    OR traffic_gb_override > 0
  ),

  CHECK (
    duration_days_override IS NULL
    OR duration_days_override > 0
  ),

  CHECK (
    ip_limit_override IS NULL
    OR ip_limit_override >= 0
  ),

  CHECK (
    available_until IS NULL
    OR available_from IS NULL
    OR available_until > available_from
  )
);

CREATE INDEX IF NOT EXISTS idx_server_plan_offers_server
ON server_plan_offers(server_id);

CREATE INDEX IF NOT EXISTS idx_server_plan_offers_plan
ON server_plan_offers(plan_id);

CREATE INDEX IF NOT EXISTS idx_server_plan_offers_active
ON server_plan_offers(is_active);

-- Snapshot غیرقابل‌تغییر سفارش
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS pricing_mode VARCHAR(20)
NOT NULL DEFAULT 'global';

ALTER TABLE orders
ADD COLUMN IF NOT EXISTS server_plan_offer_id UUID
REFERENCES server_plan_offers(id) ON DELETE SET NULL;

ALTER TABLE orders
ADD COLUMN IF NOT EXISTS pricing_snapshot JSONB
NOT NULL DEFAULT '{}'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'orders_pricing_mode_check'
  ) THEN
    ALTER TABLE orders
    ADD CONSTRAINT orders_pricing_mode_check
    CHECK (pricing_mode IN ('global', 'server'));
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_orders_pricing_mode
ON orders(pricing_mode);

CREATE INDEX IF NOT EXISTS idx_orders_server_plan_offer
ON orders(server_plan_offer_id);

-- برای اجرای دوباره Migration، Trigger قبل از Backfill حذف شود.
DROP TRIGGER IF EXISTS
  trg_orders_pricing_snapshot_immutable
ON orders;

-- برای سفارش‌های قدیمی فقط اطلاعات فعلی قابل Backfill است.
UPDATE orders o
SET pricing_snapshot = jsonb_build_object(
  'version', 1,
  'pricingSource', 'legacy_backfill',
  'pricingMode', COALESCE(o.pricing_mode, 'global'),

  'planId', o.plan_id,
  'planName', p.name,

  'trafficGB', o.traffic_gb,
  'durationDays', o.duration_days,
  'ipLimit', p.ip_limit,

  'basePrice', p.base_price,
  'pricePerGB', o.price_per_gb,
  'finalPrice', o.total_price,

  'serverId', o.server_id,
  'serverName', s.name,
  'serviceType', s.service_type,

  'capturedAt', COALESCE(o.created_at, NOW()),
  'backfilledAt', NOW()
)
FROM plans p, servers s
WHERE p.id = o.plan_id
  AND s.id = o.server_id
  AND (
    o.pricing_snapshot IS NULL
    OR o.pricing_snapshot = '{}'::jsonb
  );

-- جلوگیری از تغییر اطلاعات قیمت‌گذاری سفارش بعد از ثبت
CREATE OR REPLACE FUNCTION prevent_order_pricing_snapshot_update()
RETURNS TRIGGER AS $$
BEGIN
  IF
    NEW.pricing_snapshot
      IS DISTINCT FROM
    OLD.pricing_snapshot

    OR NEW.pricing_mode
      IS DISTINCT FROM
    OLD.pricing_mode

    OR NEW.server_plan_offer_id
      IS DISTINCT FROM
    OLD.server_plan_offer_id
  THEN
    RAISE EXCEPTION
      'Order pricing snapshot is immutable'
      USING ERRCODE =
        'integrity_constraint_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS
  trg_orders_pricing_snapshot_immutable
ON orders;

CREATE TRIGGER
  trg_orders_pricing_snapshot_immutable
BEFORE UPDATE OF
  pricing_snapshot,
  pricing_mode,
  server_plan_offer_id
ON orders
FOR EACH ROW
EXECUTE FUNCTION
  prevent_order_pricing_snapshot_update();
