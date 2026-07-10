# معماری سیستم داشبورد عمده‌فروشی 3x-ui

## 🏗️ معماری کلی

```
┌─────────────────────────────────────────────────────────────────────┐
│                           Client (Browser)                          │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────┐  │
│  │  Admin Panel    │  │ Wholesale Panel │  │   Mobile PWA        │  │
│  │  (React/Next)   │  │  (React/Next)   │  │   (React/Next)      │  │
│  └────────┬────────┘  └────────┬────────┘  └─────────┬───────────┘  │
└───────────┼─────────────────────┼─────────────────────┼─────────────┘
            │                     │                     │
            └──────────────────┬──┴─────────────────────┘
                               │ HTTPS
            ┌──────────────────▼──────────────────┐
            │           Reverse Proxy             │
            │      (Nginx / Caddy / Traefik)      │
            │    - SSL Termination                │
            │    - Rate Limiting                  │
            │    - Load Balancing                 │
            └──────────────────┬──────────────────┘
                               │
            ┌──────────────────▼──────────────────┐
            │          API Gateway Layer          │
            │         (NestJS / Fastify)          │
            │    ┌─────────────────────────────┐  │
            │    │   Authentication Middleware │  │
            │    │   - JWT Validation          │  │
            │    │   - Session Management      │  │
            │    │   - RBAC                    │  │
            │    └─────────────────────────────┘  │
            │    ┌─────────────────────────────┐  │
            │    │   Security Middleware       │  │
            │    │   - Rate Limiting           │  │
            │    │   - CSRF Protection         │  │
            │    │   - Input Validation (Zod)  │  │
            │    └─────────────────────────────┘  │
            └──────────────────┬──────────────────┘
                               │
        ┌──────────────────────┼──────────────────────┐
        │                      │                      │
┌───────▼───────┐    ┌─────────▼─────────┐    ┌──────▼──────┐
│  Business     │    │    3x-ui API      │    │   Cache     │
│  Logic Layer  │    │    Client         │    │   (Redis)   │
│               │    │                   │    │             │
│ - Pricing     │    │ - Session Mgmt    │    │ - Sessions  │
│ - Wallet      │    │ - Connection Pool │    │ - Rate Limit│
│ - Orders      │    │ - Retry Logic     │    │ - Cache     │
│ - EndUsers    │    │ - Error Handling  │    │             │
└───────┬───────┘    └─────────┬─────────┘    └──────┬──────┘
        │                      │                      │
        └──────────┬───────────┘                      │
                   │                                   │
        ┌──────────▼───────────────────────────────────▼─┐
        │                PostgreSQL Database              │
        │    ┌─────────────────────────────────────────┐  │
        │    │  - Users & Roles                        │  │
        │    │  - Wholesale Customers                  │  │
        │    │  - Wallets & Transactions               │  │
        │    │  - Plans & Pricing                      │  │
        │    │  - Servers & Inbounds                   │  │
        │    │  - End Users                            │  │
        │    │  - Orders & Invoices                    │  │
        │    │  - Audit Logs                           │  │
        │    └─────────────────────────────────────────┘  │
        └───────────────────────────────────────────────┬─┘
                                                        │
        ┌───────────────────────────────────────────────▼─┐
        │               3x-ui Panel Servers               │
        │  ┌─────────┐  ┌─────────┐  ┌─────────┐         │
        │  │Server 1 │  │Server 2 │  │Server N │         │
        │  │ Germany │  │ Holland │  │  France │         │
        │  └─────────┘  └─────────┘  └─────────┘         │
        └─────────────────────────────────────────────────┘
```

---

## 📁 ساختار پروژه پیشنهادی

```
wholesale-panel/
├── apps/
│   ├── web/                          # Next.js Frontend
│   │   ├── src/
│   │   │   ├── app/                  # App Router
│   │   │   ├── components/
│   │   │   │   ├── ui/               # Base UI components
│   │   │   │   ├── admin/            # Admin-specific
│   │   │   │   └── wholesale/        # Wholesale-specific
│   │   │   ├── hooks/
│   │   │   ├── lib/
│   │   │   ├── stores/               # Zustand stores
│   │   │   └── types/
│   │   ├── public/
│   │   └── package.json
│   │
│   └── api/                          # NestJS Backend
│       ├── src/
│       │   ├── modules/
│       │   │   ├── auth/
│       │   │   ├── users/
│       │   │   ├── customers/
│       │   │   ├── wallet/
│       │   │   ├── plans/
│       │   │   ├── orders/
│       │   │   ├── servers/
│       │   │   ├── threexui/         # 3x-ui API client
│       │   │   └── audit/
│       │   ├── common/
│       │   │   ├── guards/
│       │   │   ├── decorators/
│       │   │   ├── filters/
│       │   │   ├── interceptors/
│       │   │   └── pipes/
│       │   ├── config/
│       │   └── main.ts
│       ├── prisma/                   # یا drizzle/
│       │   └── schema.prisma
│       └── package.json
│
├── packages/
│   ├── threexui-client/              # Shared 3x-ui API client
│   ├── shared-types/                 # Shared TypeScript types
│   └── utils/                        # Shared utilities
│
├── docker/
│   ├── docker-compose.yml
│   ├── docker-compose.prod.yml
│   └── Dockerfile.api
│
├── docs/
│   ├── api.md
│   ├── architecture.md
│   └── deployment.md
│
├── turbo.json                        # Turborepo config
├── pnpm-workspace.yaml
└── README.md
```

---

## 🔧 انتخاب تکنولوژی‌ها

### Backend Framework: NestJS

**دلایل:**
- معماری ماژولار
- Dependency Injection داخلی
- اکوسیستم غنی
- مناسب برای پروژه‌های Enterprise
- پشتیبانی از TypeORM/Prisma/Drizzle
- Guards, Interceptors, Pipes داخلی

### Frontend: Next.js 14 (App Router)

**دلایل:**
- Server Components
- Server Actions
- Edge Runtime
- Built-in API routes
- Image/Font optimization
- SEO friendly

### UI Library: shadcn/ui + Tailwind CSS

**دلایل:**
- کامپوننت‌های کپی‌شده (نه dependency)
- کاملاً قابل شخصی‌سازی
- Accessible
- Dark mode support
- RTL support با Tailwind

### Database: PostgreSQL + Drizzle ORM

**دلایل:**
- Type-safety عالی
- Performance بالا
- SQL-like syntax
- سبک و سریع

### Cache: Redis

**دلایل:**
- Session storage
- Rate limiting
- Caching 3x-ui responses
- Background job queues

---

## 🔄 جریان‌های اصلی

### 1. ساخت کانفیگ جدید

```
┌─────────┐     ┌─────────┐     ┌─────────┐     ┌─────────┐     ┌─────────┐
│Wholesale│────>│  API    │────>│ Wallet  │────>│ 3x-ui   │────>│  Order  │
│ Panel   │     │ Gateway │     │ Service │     │ Client  │     │ Service │
└─────────┘     └─────────┘     └─────────┘     └─────────┘     └─────────┘
     │               │               │               │               │
     │   Request     │               │               │               │
     │──────────────>│   Validate    │               │               │
     │               │──────────────>│  Check Balance│               │
     │               │               │──────────────>│               │
     │               │               │<──────────────│               │
     │               │               │   Debit       │               │
     │               │               │   (pending)   │               │
     │               │               │──────────────>│               │
     │               │               │               │   addClient   │
     │               │               │               │──────────────>│
     │               │               │               │<──────────────│
     │               │               │               │   Success?    │
     │               │               │               │       │       │
     │               │               │   Confirm/    │<──────┘       │
     │               │               │   Rollback    │               │
     │               │               │<──────────────│               │
     │               │<──────────────────────────────────────────────│
     │<──────────────│                                               │
     │   Response    │               Create Order                    │
     │               │               Create Invoice                  │
     │               │               Audit Log                       │
```

### 2. شارژ کیف پول توسط ادمین

```
┌─────────┐     ┌─────────┐     ┌─────────┐     ┌─────────┐
│  Admin  │────>│  API    │────>│ Wallet  │────>│  Audit  │
│ Panel   │     │ Gateway │     │ Service │     │   Log   │
└─────────┘     └─────────┘     └─────────┘     └─────────┘
     │               │               │               │
     │  Charge Req   │               │               │
     │──────────────>│  Validate     │               │
     │               │  Admin Role   │               │
     │               │──────────────>│               │
     │               │               │  Create TX    │
     │               │               │  (idempotent) │
     │               │               │──────────────>│
     │               │               │               │  Log Action
     │               │               │<──────────────│
     │               │<──────────────│               │
     │<──────────────│               │               │
     │   Success     │               │               │
```

---

## 🔐 امنیت

### 1. احراز هویت
- JWT با Refresh Token
- Session-based برای 3x-ui
- 2FA با TOTP

### 2. مجوزدهی (RBAC)
```typescript
enum Role {
  SUPER_ADMIN = 'super_admin',
  ADMIN = 'admin',
  WHOLESALE = 'wholesale'
}

// Permissions
const permissions = {
  [Role.SUPER_ADMIN]: ['*'],
  [Role.ADMIN]: [
    'customers:read', 'customers:write',
    'orders:read', 'orders:write',
    'plans:read', 'plans:write',
    'servers:read',
    'reports:read'
  ],
  [Role.WHOLESALE]: [
    'own:endusers:read', 'own:endusers:write',
    'own:orders:read', 'own:orders:write',
    'own:wallet:read',
    'plans:read'
  ]
};
```

### 3. Rate Limiting
```typescript
// Per user rate limits
const rateLimits = {
  login: { window: '15m', max: 5 },
  api: { window: '1m', max: 100 },
  createConfig: { window: '1m', max: 10 }
};
```

### 4. Input Validation
همه ورودی‌ها با Zod اعتبارسنجی می‌شوند.

---

## 📦 Deployment

### Docker Compose (Production)

```yaml
version: '3.8'

services:
  api:
    build: ./apps/api
    environment:
      - DATABASE_URL=postgresql://user:pass@db:5432/wholesale
      - REDIS_URL=redis://redis:6379
      - ENCRYPTION_KEY=${ENCRYPTION_KEY}
    depends_on:
      - db
      - redis

  web:
    build: ./apps/web
    environment:
      - API_URL=http://api:3000
    depends_on:
      - api

  db:
    image: postgres:15
    volumes:
      - postgres_data:/var/lib/postgresql/data
    environment:
      - POSTGRES_DB=wholesale
      - POSTGRES_USER=user
      - POSTGRES_PASSWORD=${DB_PASSWORD}

  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
      - ./ssl:/etc/nginx/ssl
    depends_on:
      - web
      - api

volumes:
  postgres_data:
  redis_data:
```

---

## 🔍 مانیتورینگ و لاگینگ

### استک پیشنهادی:
- **Metrics:** Prometheus + Grafana
- **Logs:** Loki یا ELK Stack
- **APM:** Sentry
- **Uptime:** UptimeRobot / Healthchecks.io

### Healthcheck Endpoints:
```
GET /health         # Basic health
GET /health/ready   # All dependencies ready
GET /health/live    # Application running
```
