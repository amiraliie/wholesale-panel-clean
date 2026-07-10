# مستندات API واقعی 3x-ui نسخه v2.8.8

## 🔐 احراز هویت

3x-ui از Session-Based Authentication استفاده می‌کند:

### Endpoint ورود
```
POST /login
Content-Type: application/x-www-form-urlencoded

Body:
username=admin&password=admin123
```

**پاسخ موفق:**
```json
{
  "success": true,
  "msg": ""
}
```

کوکی `3x-ui` در پاسخ ست می‌شود و باید در تمام درخواست‌های بعدی ارسال شود.

---

## 📡 API های Inbound

**مسیر پایه:** `/panel/api/inbounds`

### 1. لیست همه Inbound ها
```
GET /panel/api/inbounds/list
Cookie: 3x-ui=SESSION_TOKEN

Response:
{
  "success": true,
  "msg": "",
  "obj": [
    {
      "id": 1,
      "up": 0,
      "down": 0,
      "total": 0,
      "remark": "vless-ws",
      "enable": true,
      "expiryTime": 0,
      "clientStats": [...],
      "listen": "",
      "port": 443,
      "protocol": "vless",
      "settings": "{...}",
      "streamSettings": "{...}",
      "tag": "inbound-443",
      "sniffing": "{...}"
    }
  ]
}
```

### 2. دریافت یک Inbound
```
GET /panel/api/inbounds/get/:id
Cookie: 3x-ui=SESSION_TOKEN
```

### 3. افزودن Client به Inbound
```
POST /panel/api/inbounds/addClient
Cookie: 3x-ui=SESSION_TOKEN
Content-Type: application/x-www-form-urlencoded

Body:
id=1&settings={"clients":[{"id":"uuid","flow":"","email":"user@example.com","limitIp":2,"totalGB":53687091200,"expiryTime":1707955200000,"enable":true,"tgId":"","subId":"abc123xyz","reset":0}]}
```

### 4. بروزرسانی Client
```
POST /panel/api/inbounds/updateClient/:clientId
Cookie: 3x-ui=SESSION_TOKEN
Content-Type: application/x-www-form-urlencoded

Body:
id=1&settings={"clients":[{...updated client...}]}
```

### 5. حذف Client
```
POST /panel/api/inbounds/:id/delClient/:clientId
Cookie: 3x-ui=SESSION_TOKEN
```

### 6. حذف Client با ایمیل (v2.8.0+)
```
POST /panel/api/inbounds/:id/delClientByEmail/:email
Cookie: 3x-ui=SESSION_TOKEN
```

### 7. دریافت ترافیک Client
```
GET /panel/api/inbounds/getClientTraffics/:email
Cookie: 3x-ui=SESSION_TOKEN

Response:
{
  "success": true,
  "msg": "",
  "obj": {
    "id": 1,
    "inboundId": 1,
    "enable": true,
    "email": "user@example.com",
    "up": 123456789,
    "down": 987654321,
    "expiryTime": 1707955200000,
    "total": 53687091200,
    "reset": 0
  }
}
```

### 8. ریست ترافیک Client
```
POST /panel/api/inbounds/:id/resetClientTraffic/:email
Cookie: 3x-ui=SESSION_TOKEN
```

### 9. دریافت IP های Client
```
POST /panel/api/inbounds/clientIps/:email
Cookie: 3x-ui=SESSION_TOKEN
```

### 10. پاک کردن IP های Client
```
POST /panel/api/inbounds/clearClientIps/:email
Cookie: 3x-ui=SESSION_TOKEN
```

### 11. دریافت لیست آنلاین‌ها
```
POST /panel/api/inbounds/onlines
Cookie: 3x-ui=SESSION_TOKEN

Response:
{
  "success": true,
  "msg": "",
  "obj": ["user1@example.com", "user2@example.com"]
}
```

### 12. آخرین وضعیت آنلاین
```
POST /panel/api/inbounds/lastOnline
Cookie: 3x-ui=SESSION_TOKEN
```

---

## 🖥️ API های Server

**مسیر پایه:** `/panel/api/server`

### 1. وضعیت سرور
```
GET /panel/api/server/status
Cookie: 3x-ui=SESSION_TOKEN

Response:
{
  "success": true,
  "msg": "",
  "obj": {
    "cpu": 15.5,
    "cpuCores": 4,
    "cpuSpeedMhz": 2400,
    "mem": { "current": 1073741824, "total": 4294967296 },
    "swap": { "current": 0, "total": 2147483648 },
    "disk": { "current": 10737418240, "total": 53687091200 },
    "xray": { "state": "running", "version": "1.8.7" },
    "uptime": 86400,
    "loads": [0.5, 0.6, 0.7],
    "tcpCount": 150,
    "udpCount": 50,
    "netIO": { "up": 1048576, "down": 5242880 },
    "netTraffic": { "sent": 107374182400, "recv": 536870912000 },
    "publicIP": { "ipv4": "1.2.3.4" }
  }
}
```

### 2. دریافت نسخه‌های Xray
```
GET /panel/api/server/getXrayVersion
```

### 3. ریستارت Xray
```
POST /panel/api/server/restartXrayService
```

### 4. ایجاد UUID جدید
```
GET /panel/api/server/getNewUUID
```

### 5. ایجاد گواهی X25519 جدید (برای Reality)
```
GET /panel/api/server/getNewX25519Cert
```

---

## 📥 Subscription API

این API از طریق سرور subscription در دسترس است (نه API اصلی):

```
GET /sub/:subId
Host: subscription-domain:port

Response: Base64 encoded config links
```

```
GET /sub/:subId?json=true
Response: JSON subscription format
```

---

## ⚠️ نکات مهم

1. **احراز هویت:** همه API ها نیاز به کوکی session دارند
2. **Rate Limiting:** 3x-ui rate limiting ندارد - باید در لایه خودمان پیاده‌سازی شود
3. **idempotency:** API ها idempotent نیستند - باید خودمان کنترل کنیم
4. **SSL:** در production حتماً HTTPS استفاده شود

---

## 🚫 API هایی که وجود ندارند

- ❌ API مستقیم برای دریافت لینک subscription از panel (باید خودمان بسازیم)
- ❌ API برای مدیریت کاربران panel
- ❌ API برای wallet یا billing (باید خودمان بسازیم)
- ❌ API برای گزارشگیری پیشرفته

---

## 📦 ساختار Client Object

```typescript
interface ThreeXUIClient {
  id: string;           // UUID برای VLESS/VMESS, password برای Trojan
  flow?: string;        // فقط برای VLESS با XTLS
  email: string;        // شناسه یکتای کلاینت
  limitIp?: number;     // محدودیت IP، 0 = نامحدود
  totalGB: number;      // کل ترافیک به بایت
  expiryTime: number;   // Unix timestamp به میلی‌ثانیه، 0 = بدون انقضا
  enable: boolean;
  tgId?: string;        // شناسه تلگرام
  subId: string;        // شناسه subscription
  reset?: number;       // بازه ریست ترافیک به روز
}
```
