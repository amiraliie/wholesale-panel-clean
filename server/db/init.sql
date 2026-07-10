-- Initialize Database Schema for Wholesale Panel
-- PostgreSQL 15+

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

BEGIN;

-- ==================== USERS ====================
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('super_admin', 'admin', 'wholesale')),
    is_active BOOLEAN DEFAULT true,
    two_factor_secret VARCHAR(255),
    two_factor_enabled BOOLEAN DEFAULT false,
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- ==================== WHOLESALE CUSTOMERS ====================
CREATE TABLE IF NOT EXISTS wholesale_customers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    company_name VARCHAR(255),
    phone VARCHAR(20),
    credit_limit BIGINT DEFAULT 0,
    min_balance BIGINT DEFAULT 0,
    daily_order_limit INT DEFAULT 100,
    monthly_order_limit INT DEFAULT 3000,
    is_active BOOLEAN DEFAULT true,
    notes TEXT,
    allowed_server_ids UUID[] DEFAULT '{}',
    allowed_inbound_ids UUID[] DEFAULT '{}',
    allowed_plan_ids UUID[] DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wholesale_customers_user_id ON wholesale_customers(user_id);
CREATE INDEX IF NOT EXISTS idx_wholesale_customers_is_active ON wholesale_customers(is_active);

-- ==================== WALLETS ====================
CREATE TABLE IF NOT EXISTS wallets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    wholesale_customer_id UUID UNIQUE NOT NULL REFERENCES wholesale_customers(id) ON DELETE CASCADE,
    balance BIGINT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wallets_customer ON wallets(wholesale_customer_id);

-- ==================== SERVERS ====================
CREATE TABLE IF NOT EXISTS servers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    host VARCHAR(255) NOT NULL,
    port INT NOT NULL DEFAULT 2053,
    base_path VARCHAR(255) DEFAULT '/panel',
    username_encrypted BYTEA NOT NULL,
    password_encrypted BYTEA NOT NULL,
    is_active BOOLEAN DEFAULT true,
    location VARCHAR(255),
    description TEXT,
    last_health_check TIMESTAMPTZ,
    health_status VARCHAR(20) DEFAULT 'unknown',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_servers_is_active ON servers(is_active);

-- ==================== INBOUNDS ====================
CREATE TABLE IF NOT EXISTS inbounds (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    server_id UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    threexui_inbound_id INT NOT NULL,
    name VARCHAR(255) NOT NULL,
    protocol VARCHAR(50) NOT NULL,
    port INT NOT NULL,
    is_active BOOLEAN DEFAULT true,
    tag VARCHAR(255),
    settings TEXT,
    stream_settings TEXT,
    sniffing TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(server_id, threexui_inbound_id)
);

CREATE INDEX IF NOT EXISTS idx_inbounds_server ON inbounds(server_id);
CREATE INDEX IF NOT EXISTS idx_inbounds_is_active ON inbounds(is_active);

-- ==================== PLANS ====================
CREATE TABLE IF NOT EXISTS plans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    traffic_gb INT NOT NULL,
    duration_days INT NOT NULL,
    base_price BIGINT NOT NULL,
    price_per_gb BIGINT NOT NULL,
    ip_limit INT DEFAULT 1,
    is_active BOOLEAN DEFAULT true,
    allowed_inbound_ids UUID[] DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_plans_is_active ON plans(is_active);

-- ==================== CUSTOMER SPECIFIC PRICES ====================
CREATE TABLE IF NOT EXISTS customer_specific_prices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    wholesale_customer_id UUID NOT NULL REFERENCES wholesale_customers(id) ON DELETE CASCADE,
    plan_id UUID REFERENCES plans(id) ON DELETE CASCADE,
    price_per_gb BIGINT,
    flat_price BIGINT,
    discount_percent DECIMAL(5,2),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(wholesale_customer_id, plan_id)
);

CREATE INDEX IF NOT EXISTS idx_customer_prices_customer ON customer_specific_prices(wholesale_customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_prices_plan ON customer_specific_prices(plan_id);

-- ==================== END USERS ====================
CREATE TABLE IF NOT EXISTS end_users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    wholesale_customer_id UUID NOT NULL REFERENCES wholesale_customers(id) ON DELETE CASCADE,
    server_id UUID NOT NULL REFERENCES servers(id),
    inbound_id UUID NOT NULL REFERENCES inbounds(id),
    threexui_client_id VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    sub_id VARCHAR(50) NOT NULL,
    plan_id UUID REFERENCES plans(id),
    traffic_limit BIGINT NOT NULL,
    traffic_used BIGINT DEFAULT 0,
    expiry_time TIMESTAMPTZ NOT NULL,
    ip_limit INT DEFAULT 1,
    is_active BOOLEAN DEFAULT true,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'disabled', 'expired', 'limited')),
    last_synced_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_end_users_customer ON end_users(wholesale_customer_id);
CREATE INDEX IF NOT EXISTS idx_end_users_server ON end_users(server_id);
CREATE INDEX IF NOT EXISTS idx_end_users_inbound ON end_users(inbound_id);
CREATE INDEX IF NOT EXISTS idx_end_users_email ON end_users(email);
CREATE INDEX IF NOT EXISTS idx_end_users_sub_id ON end_users(sub_id);
CREATE INDEX IF NOT EXISTS idx_end_users_status ON end_users(status);
CREATE INDEX IF NOT EXISTS idx_end_users_expiry ON end_users(expiry_time);
CREATE UNIQUE INDEX IF NOT EXISTS uq_end_users_server_inbound_email ON end_users(server_id, inbound_id, email);

-- ==================== ORDERS ====================
CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    wholesale_customer_id UUID NOT NULL REFERENCES wholesale_customers(id),
    type VARCHAR(20) NOT NULL CHECK (type IN ('new', 'renew', 'upgrade', 'traffic_add')),
    end_user_id UUID REFERENCES end_users(id),
    plan_id UUID NOT NULL REFERENCES plans(id),
    server_id UUID NOT NULL REFERENCES servers(id),
    inbound_id UUID NOT NULL REFERENCES inbounds(id),
    traffic_gb INT NOT NULL,
    duration_days INT NOT NULL,
    price_per_gb BIGINT NOT NULL,
    total_price BIGINT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled', 'refunded')),
    threexui_response JSONB,
    error_message TEXT,
    idempotency_key VARCHAR(255) UNIQUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(wholesale_customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);
CREATE INDEX IF NOT EXISTS idx_orders_type ON orders(type);

-- ==================== WALLET TRANSACTIONS ====================
CREATE TABLE IF NOT EXISTS wallet_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    wallet_id UUID NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
    type VARCHAR(20) NOT NULL CHECK (type IN ('credit', 'debit', 'refund', 'adjustment')),
    amount BIGINT NOT NULL,
    balance_before BIGINT NOT NULL,
    balance_after BIGINT NOT NULL,
    description TEXT NOT NULL,
    order_id UUID REFERENCES orders(id),
    created_by UUID REFERENCES users(id),
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'cancelled')),
    idempotency_key VARCHAR(255) UNIQUE NOT NULL,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wallet_transactions_wallet ON wallet_transactions(wallet_id);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_status ON wallet_transactions(status);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_created_at ON wallet_transactions(created_at);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_idempotency ON wallet_transactions(idempotency_key);

-- ==================== INVOICES ====================
CREATE TABLE IF NOT EXISTS invoices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    wholesale_customer_id UUID NOT NULL REFERENCES wholesale_customers(id),
    order_id UUID NOT NULL REFERENCES orders(id),
    invoice_number VARCHAR(50) UNIQUE NOT NULL,
    amount BIGINT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'cancelled')),
    due_date DATE NOT NULL,
    paid_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invoices_customer ON invoices(wholesale_customer_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_due_date ON invoices(due_date);

-- ==================== AUDIT LOGS ====================
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id),
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(100) NOT NULL,
    entity_id VARCHAR(255) NOT NULL,
    old_value JSONB,
    new_value JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);

-- ==================== API CREDENTIALS ====================
CREATE TABLE IF NOT EXISTS api_credentials (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    server_id UUID UNIQUE NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    session_cookie_encrypted BYTEA,
    last_login TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==================== REFRESH SESSIONS ====================
CREATE TABLE IF NOT EXISTS refresh_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_refresh_sessions_user ON refresh_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_sessions_expires ON refresh_sessions(expires_at);

-- ==================== APP SETTINGS ====================
CREATE TABLE IF NOT EXISTS app_settings (
    key VARCHAR(100) PRIMARY KEY,
    value JSONB NOT NULL DEFAULT '{}',
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==================== TRIGGERS ====================
-- Auto-update updated_at column
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply trigger to all tables with updated_at
DO $$
DECLARE
    t text;
BEGIN
    FOR t IN 
        SELECT table_name 
        FROM information_schema.columns 
        WHERE column_name = 'updated_at' 
        AND table_schema = 'public'
    LOOP
        EXECUTE format('
            DROP TRIGGER IF EXISTS update_%I_updated_at ON %I;
            CREATE TRIGGER update_%I_updated_at
                BEFORE UPDATE ON %I
                FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
        ', t, t, t, t);
    END LOOP;
END;
$$;

-- ==================== SEED DATA ====================
-- Insert default admin user (password: admin123)
INSERT INTO users (id, username, email, password_hash, role, is_active)
VALUES (
    '00000000-0000-0000-0000-000000000001',
    'admin',
    'admin@example.com',
    crypt('admin123', gen_salt('bf')), -- change after first login
    'super_admin',
    true
) ON CONFLICT (username) DO NOTHING;

-- Insert sample plans
INSERT INTO plans (id, name, description, traffic_gb, duration_days, base_price, price_per_gb, ip_limit, is_active)
VALUES 
    ('00000000-0000-0000-0000-000000000101', 'پلن برنزی', 'مناسب برای استفاده شخصی', 10, 30, 450000, 45000, 1, true),
    ('00000000-0000-0000-0000-000000000102', 'پلن نقره‌ای', 'مناسب برای خانواده', 30, 30, 1200000, 40000, 2, true),
    ('00000000-0000-0000-0000-000000000103', 'پلن طلایی', 'مناسب برای کاربران حرفه‌ای', 50, 30, 1750000, 35000, 3, true),
    ('00000000-0000-0000-0000-000000000104', 'پلن الماسی', 'مناسب برای شرکت‌ها', 100, 30, 3000000, 30000, 5, true)
ON CONFLICT DO NOTHING;

-- Create wholesale demo user
INSERT INTO users (id, username, email, password_hash, role, is_active)
VALUES (
    '00000000-0000-0000-0000-000000000002',
    'wholesale',
    'wholesale@example.com',
    crypt('wholesale123', gen_salt('bf')), -- demo; change/remove in production
    'wholesale',
    true
) ON CONFLICT (username) DO NOTHING;

-- Create wholesale customer for demo user
INSERT INTO wholesale_customers (id, user_id, company_name, phone, credit_limit, min_balance, is_active)
VALUES (
    '00000000-0000-0000-0000-000000000201',
    '00000000-0000-0000-0000-000000000002',
    'شرکت نمونه',
    '09123456789',
    0,
    100000,
    true
) ON CONFLICT DO NOTHING;

-- Create wallet for wholesale customer
INSERT INTO wallets (id, wholesale_customer_id, balance)
VALUES (
    '00000000-0000-0000-0000-000000000301',
    '00000000-0000-0000-0000-000000000201',
    2500000
) ON CONFLICT DO NOTHING;

COMMIT;
