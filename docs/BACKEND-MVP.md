# Backend MVP Added

این نسخه یک backend واقعی Node.js/Express/TypeScript به پروژه اضافه می‌کند تا اطلاعات حساس 3x-ui داخل مرورگر قرار نگیرد.

## معماری

- Frontend: React/Vite، خروجی `dist`
- Backend: Express روی `127.0.0.1:4000`
- Database: PostgreSQL
- Nginx:
  - `/` → frontend static files
  - `/api` → backend
  - `/sub` → subscription backend

## فایل‌های مهم اضافه‌شده

- `server/src/index.ts`
- `server/src/app.ts`
- `server/src/services/threexui.service.ts`
- `server/src/services/order.service.ts`
- `server/src/services/wallet.service.ts`
- `server/src/services/server.service.ts`
- `server/db/migrations/001_init.sql`
- `src/services/api.ts`

## نکات امنیتی

- لاگین mock حذف شده است.
- توکن ورود داخل cookie با `httpOnly` ذخیره می‌شود.
- اطلاعات ورود 3x-ui در دیتابیس encrypt می‌شود.
- عملیات ساخت کانفیگ، کم کردن کیف پول، ثبت سفارش و refund در backend انجام می‌شود.

## اجرای توسعه‌ای

```bash
npm install
npm --prefix server install
cp server/.env.example server/.env
npm run server:migrate
npm run server:create-admin
npm run server:dev
npm run dev
```

## اجرای production

```bash
npm run build
npm --prefix server run build
npm --prefix server run start
```

در production بهتر است backend با systemd اجرا شود و Nginx کانفیگ `nginx.conf` را استفاده کند.
