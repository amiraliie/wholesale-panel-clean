# طرح دیتابیس PostgreSQL

## 📊 Entity Relationship Diagram

```
┌─────────────┐     ┌──────────────────┐     ┌────────────┐
│    User     │────<│ WholesaleCustomer│────<│   Wallet   │
└─────────────┘     └──────────────────┘     └────────────┘
                           │                        │
                           │                        │
                    ┌──────┴──────┐          ┌──────┴──────┐
                    │             │          │             │
               ┌────▼────┐  ┌─────▼─────┐  ┌─▼─────────────▼─┐
               │ EndUser │  │   Order   │  │WalletTransaction│
               └─────────┘  └───────────┘  └─────────────────┘
                    │             │
                    │        ┌────┴────┐
                    │        │ Invoice │
                    │        └─────────┘
                    │
               ┌────▼────┐
               │Inbound  │────<│Server│
               └─────────┘     └──────┘
```

---

## 📋 جداول

### 1. users
```sql
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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

CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);
```

### 2. wholesale_customers
```sql
CREATE TABLE wholesale_customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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

CREATE INDEX idx_wholesale_customers_user_id ON wholesale_customers(user_id);
CREATE INDEX idx_wholesale_customers_is_active ON wholesale_customers(is_active);
```

### 3. wallets
```sql
CREATE TABLE wallets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wholesale_customer_id UUID UNIQUE NOT NULL REFERENCES wholesale_customers(id) ON DELETE CASCADE,
    balance BIGINT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_wallets_customer ON wallets(wholesale_customer_id);
```

### 4. wallet_transactions
```sql
CREATE TABLE wallet_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wallet_id UUID NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
    type VARCHAR(20) NOT NULL CHECK (type IN ('credit', 'debit', 'refund', 'adjustment')),
    amount BIGINT NOT NULL,
    balance_before BIGINT NOT NULL,
    balance_after BIGINT NOT NULL,
    description TEXT NOT NULL,
    order_id UUID REFERENCES orders(id),
    created_by UUID NOT NULL REFERENCES users(id),
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'cancelled')),
    idempotency_key VARCHAR(255) UNIQUE NOT NULL,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_wallet_transactions_wallet ON wallet_transactions(wallet_id);
CREATE INDEX idx_wallet_transactions_status ON wallet_transactions(status);
CREATE INDEX idx_wallet_transactions_created_at ON wallet_transactions(created_at);
CREATE INDEX idx_wallet_transactions_idempotency ON wallet_transactions(idempotency_key);
```

### 5. servers
```sql
CREATE TABLE servers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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

CREATE INDEX idx_servers_is_active ON servers(is_active);
```

### 6. inbounds
```sql
CREATE TABLE inbounds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    server_id UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    threexui_inbound_id INT NOT NULL,
    name VARCHAR(255) NOT NULL,
    protocol VARCHAR(50) NOT NULL,
    port INT NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(server_id, threexui_inbound_id)
);

CREATE INDEX idx_inbounds_server ON inbounds(server_id);
CREATE INDEX idx_inbounds_is_active ON inbounds(is_active);
```

### 7. plans
```sql
CREATE TABLE plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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

CREATE INDEX idx_plans_is_active ON plans(is_active);
```

### 8. customer_specific_prices
```sql
CREATE TABLE customer_specific_prices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wholesale_customer_id UUID NOT NULL REFERENCES wholesale_customers(id) ON DELETE CASCADE,
    plan_id UUID REFERENCES plans(id) ON DELETE CASCADE,
    price_per_gb BIGINT,
    flat_price BIGINT,
    discount_percent DECIMAL(5,2),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(wholesale_customer_id, plan_id)
);

CREATE INDEX idx_customer_prices_customer ON customer_specific_prices(wholesale_customer_id);
CREATE INDEX idx_customer_prices_plan ON customer_specific_prices(plan_id);
```

### 9. end_users
```sql
CREATE TABLE end_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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

CREATE INDEX idx_end_users_customer ON end_users(wholesale_customer_id);
CREATE INDEX idx_end_users_server ON end_users(server_id);
CREATE INDEX idx_end_users_inbound ON end_users(inbound_id);
CREATE INDEX idx_end_users_email ON end_users(email);
CREATE INDEX idx_end_users_sub_id ON end_users(sub_id);
CREATE INDEX idx_end_users_status ON end_users(status);
CREATE INDEX idx_end_users_expiry ON end_users(expiry_time);
```

### 10. orders
```sql
CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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

CREATE INDEX idx_orders_customer ON orders(wholesale_customer_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_created_at ON orders(created_at);
CREATE INDEX idx_orders_type ON orders(type);
```

### 11. invoices
```sql
CREATE TABLE invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wholesale_customer_id UUID NOT NULL REFERENCES wholesale_customers(id),
    order_id UUID NOT NULL REFERENCES orders(id),
    invoice_number VARCHAR(50) UNIQUE NOT NULL,
    amount BIGINT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'cancelled')),
    due_date DATE NOT NULL,
    paid_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_invoices_customer ON invoices(wholesale_customer_id);
CREATE INDEX idx_invoices_status ON invoices(status);
CREATE INDEX idx_invoices_due_date ON invoices(due_date);
```

### 12. audit_logs
```sql
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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

CREATE INDEX idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);
```

### 13. api_credentials (Encrypted)
```sql
CREATE TABLE api_credentials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    server_id UUID UNIQUE NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    session_cookie_encrypted BYTEA,
    last_login TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 🔐 رمزنگاری

برای فیلدهای حساس از `pgcrypto` استفاده می‌کنیم:

```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Encrypt
UPDATE servers SET password_encrypted = pgp_sym_encrypt(
    'plain_password', 
    current_setting('app.encryption_key')
);

-- Decrypt
SELECT pgp_sym_decrypt(
    password_encrypted, 
    current_setting('app.encryption_key')
) AS password FROM servers;
```

---

## 🔄 Triggers

```sql
-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Apply to all tables with updated_at
```

---

## 📈 پیشنهاد ORM: Drizzle

دلایل انتخاب Drizzle به جای Prisma:

1. **Type-safety بهتر:** تایپ‌ها از اسکیمای SQL مشتق می‌شوند
2. **سبک‌تر:** Bundle size کمتر
3. **عملکرد بهتر:** No runtime overhead
4. **SQL-like syntax:** یادگیری آسان‌تر برای توسعه‌دهندگان SQL
5. **Migrations:** کنترل بیشتر روی migrations
