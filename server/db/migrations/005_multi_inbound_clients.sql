ALTER TABLE servers
ADD COLUMN IF NOT EXISTS client_api_mode VARCHAR(20)
NOT NULL DEFAULT 'unknown';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'servers_client_api_mode_check'
  ) THEN
    ALTER TABLE servers
    ADD CONSTRAINT servers_client_api_mode_check
    CHECK (
      client_api_mode IN (
        'unknown',
        'legacy',
        'clients_v3'
      )
    );
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS end_user_inbounds (
  end_user_id UUID NOT NULL
    REFERENCES end_users(id) ON DELETE CASCADE,
  inbound_id UUID NOT NULL
    REFERENCES inbounds(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (end_user_id, inbound_id)
);

CREATE INDEX IF NOT EXISTS
  idx_end_user_inbounds_inbound
ON end_user_inbounds(inbound_id);

INSERT INTO end_user_inbounds (
  end_user_id,
  inbound_id
)
SELECT id, inbound_id
FROM end_users
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS order_inbounds (
  order_id UUID NOT NULL
    REFERENCES orders(id) ON DELETE CASCADE,
  inbound_id UUID NOT NULL
    REFERENCES inbounds(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (order_id, inbound_id)
);

CREATE INDEX IF NOT EXISTS
  idx_order_inbounds_inbound
ON order_inbounds(inbound_id);

INSERT INTO order_inbounds (
  order_id,
  inbound_id
)
SELECT id, inbound_id
FROM orders
ON CONFLICT DO NOTHING;
