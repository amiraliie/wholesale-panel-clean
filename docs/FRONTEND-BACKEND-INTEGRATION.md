# Frontend ↔ Backend Integration

این نسخه دیگر از mock data در صفحات اصلی استفاده نمی‌کند. صفحه‌های ادمین و عمده‌فروش از API های backend زیر استفاده می‌کنند:

- `/api/auth/*`
- `/api/customers`
- `/api/wallet/*`
- `/api/plans`
- `/api/pricing/*`
- `/api/servers`
- `/api/inbounds`
- `/api/orders`
- `/api/end-users`
- `/api/reports/summary`
- `/api/audit-logs`
- `/sub/:subId`

نکات مهم:

1. اتصال مستقیم frontend به 3x-ui عمداً غیرفعال شده است. تمام ارتباط‌ها باید از backend انجام شود.
2. `bcryptjs` با hashهای `crypt()` PostgreSQL سازگار نبود؛ seed دیتابیس به hash سازگار با bcrypt تغییر کرد.
3. لیست سرورها برای کاربر wholesale قابل خواندن است، ولی اطلاعات credential برگردانده نمی‌شود و عملیات create/test/sync فقط برای admin فعال است.
4. صفحه قیمت‌گذاری فعلاً فقط محاسبه قیمت را از backend می‌خواند. API ثبت قیمت اختصاصی را می‌توان در مرحله بعد اضافه کرد.
5. فاکتورها فعلاً از سفارش‌های completed ساخته می‌شوند. جدول invoices در دیتابیس وجود دارد، ولی API اختصاصی invoice هنوز MVP نیست.
