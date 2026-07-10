# 🚀 داشبورد عمده‌فروشی 3x-ui

یک داشبورد SaaS مدرن برای مدیریت فروش عمده سرویس‌های VPN بر پایه پنل 3x-ui نسخه v2.8.8

## 📋 قابلیت‌ها

### پنل مشتری عمده‌فروش
- ✅ ورود امن
- ✅ مشاهده موجودی کیف پول
- ✅ مشاهده پلن‌های مجاز
- ✅ ساخت کانفیگ جدید (با بررسی موجودی)
- ✅ دریافت لینک اشتراک
- ✅ مدیریت کاربران نهایی
- ✅ مشاهده مصرف ترافیک
- ✅ تمدید، افزایش ترافیک
- ✅ تاریخچه سفارشات
- ✅ فاکتورها

### پنل ادمین
- ✅ مدیریت مشتریان عمده‌فروش
- ✅ شارژ کیف پول
- ✅ قیمت‌گذاری اختصاصی برای هر مشتری
- ✅ مدیریت پلن‌ها
- ✅ مدیریت سرورها و Inbound ها
- ✅ گزارشات درآمد و فروش
- ✅ لاگ‌های امنیتی
- ✅ تنظیمات سیستم

## 🛠️ تکنولوژی‌ها

- **Frontend:** React 18 + TypeScript + Vite
- **Styling:** TailwindCSS
- **Charts:** Recharts
- **State:** React Query + Context
- **Icons:** Lucide React
- **Backend (پیشنهادی):** NestJS
- **Database:** PostgreSQL
- **Cache:** Redis
- **ORM:** Drizzle

## 🚀 شروع سریع

### پیش‌نیازها
- Node.js 18+
- Docker & Docker Compose (اختیاری)
- PostgreSQL 15+ (اختیاری)

### نصب و اجرا

```bash
# کلون پروژه
git clone <repo-url>
cd wholesale-panel

# نصب وابستگی‌ها
npm install

# اجرا در حالت توسعه
npm run dev

# ساخت برای پروداکشن
npm run build
```

### اجرا با Docker

```bash
# ساخت و اجرای کانتینرها
docker-compose up -d

# مشاهده لاگ‌ها
docker-compose logs -f

# توقف
docker-compose down
```

## 📁 ساختار پروژه

```
├── src/
│   ├── components/       # کامپوننت‌های UI
│   │   ├── layout/      # Layout components
│   │   └── ui/          # Base UI components
│   ├── contexts/        # React contexts
│   ├── data/            # Mock data
│   ├── hooks/           # Custom hooks
│   ├── lib/             # Utilities
│   ├── pages/           # Page components
│   │   ├── admin/       # Admin pages
│   │   └── wholesale/   # Wholesale pages
│   ├── services/        # API services
│   └── types/           # TypeScript types
├── docs/                # Documentation
├── public/              # Static files
├── docker-compose.yml   # Docker configuration
├── Dockerfile          # Docker build file
├── nginx.conf          # Nginx configuration
└── init.sql            # Database schema
```

## 🔌 API های 3x-ui v2.8.8

این پروژه از API های واقعی 3x-ui استفاده می‌کند:

| Method | Endpoint | توضیحات |
|--------|----------|---------|
| POST | `/login` | ورود و دریافت session |
| GET | `/panel/api/inbounds/list` | لیست inbounds |
| POST | `/panel/api/inbounds/addClient` | افزودن client |
| POST | `/panel/api/inbounds/updateClient/:id` | ویرایش client |
| POST | `/panel/api/inbounds/:id/delClient/:clientId` | حذف client |
| GET | `/panel/api/inbounds/getClientTraffics/:email` | دریافت ترافیک |
| POST | `/panel/api/inbounds/:id/resetClientTraffic/:email` | ریست ترافیک |
| GET | `/panel/api/server/status` | وضعیت سرور |

برای جزئیات کامل به فایل `docs/3xui-api-v2.8.8.md` مراجعه کنید.

## 🔐 امنیت

- JWT Authentication
- Session-based auth برای 3x-ui
- RBAC (Super Admin, Admin, Wholesale)
- Rate Limiting
- Input Validation با Zod
- Idempotency برای عملیات مالی
- رمزنگاری credentials
- Audit Logging

## 📊 دیتابیس

طرح دیتابیس شامل جداول زیر است:
- users
- wholesale_customers
- wallets
- wallet_transactions
- servers
- inbounds
- plans
- customer_specific_prices
- end_users
- orders
- invoices
- audit_logs

برای جزئیات به `docs/database-schema.md` مراجعه کنید.

## 🧪 اطلاعات ورود دمو

| نقش | نام کاربری | رمز عبور |
|-----|-----------|----------|
| ادمین | admin | admin123 |
| عمده‌فروش | wholesale | wholesale123 |

## 📝 مجوز

MIT License

## 🤝 مشارکت

Pull Request ها خوش‌آمدید!
