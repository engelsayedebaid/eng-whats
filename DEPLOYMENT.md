# دليل النشر السريع - Quick Deployment Guide

## المشكلة: أخطاء 404 في socket.io

إذا رأيت أخطاء `404 (Not Found)` في console عند محاولة الاتصال بـ socket.io، فهذا يعني أن:
- ✅ Frontend (Next.js) يعمل على Netlify
- ❌ Backend (server.js) غير متاح أو غير منشور

## الحل السريع (5 دقائق)

### الخطوة 1: نشر Backend على Railway

1. اذهب إلى [railway.app](https://railway.app) وأنشئ حساب
2. اضغط "New Project" → "Deploy from GitHub repo"
3. اختر مستودعك
4. Railway سيكتشف `nixpacks.toml` تلقائياً
5. انتظر حتى يكتمل النشر (2-3 دقائق)
6. اضغط على المشروع → Settings → Domains
7. انسخ الـ URL (مثل: `https://whatsapp-pro-production.up.railway.app`)

### الخطوة 2: إعداد Netlify

1. اذهب إلى Netlify Dashboard → مشروعك
2. Settings → Environment Variables
3. اضغط "Add variable":
   - **Key**: `NEXT_PUBLIC_SOCKET_URL`
   - **Value**: URL الذي نسخته من Railway (مثل: `https://whatsapp-pro-production.up.railway.app`)
4. اضغط "Save"
5. اذهب إلى Deploys → Trigger deploy → Clear cache and deploy site

### الخطوة 3: التحقق

1. افتح موقعك على Netlify
2. افتح Developer Console (F12)
3. يجب أن ترى اتصال socket.io ناجح (بدون أخطاء 404)
4. يجب أن ترى "جاري الاتصال بالخادم..." ثم QR Code

## بدائل أخرى

### Render.com
1. أنشئ "Web Service" جديد
2. اربط GitHub repo
3. Build Command: `npm run build`
4. Start Command: `npm start`
5. احصل على URL وأضفه إلى Netlify

### VPS مع PM2
```bash
# على الخادم
git clone <your-repo>
cd eng-whats
npm install
npm run build

# تثبيت PM2
npm install -g pm2

# تشغيل الخادم
pm2 start server.js --name whatsapp-pro
pm2 save
pm2 startup  # اتبع التعليمات

# إعداد Nginx (اختياري)
# أضف reverse proxy إلى localhost:3000
```

## التحقق من أن كل شيء يعمل

### Backend يعمل؟
افتح في المتصفح: `https://your-backend-url.railway.app`
- يجب أن ترى صفحة Next.js أو رسالة خطأ (هذا طبيعي، المهم أن الخادم يعمل)

### Socket.io يعمل؟
افتح: `https://your-backend-url.railway.app/socket.io/?EIO=4&transport=polling`
- يجب أن ترى رد JSON (ليس 404)

### Frontend متصل؟
1. افتح موقع Netlify
2. F12 → Console
3. يجب أن ترى: `Socket connected` أو لا توجد أخطاء 404

## استكشاف الأخطاء

### لا يزال 404؟
- ✅ تأكد من أن `NEXT_PUBLIC_SOCKET_URL` موجود في Netlify
- ✅ تأكد من أن القيمة صحيحة (نسخ/لصق من Railway)
- ✅ أعد نشر Netlify بعد إضافة المتغير
- ✅ تأكد من أن Backend يعمل على Railway

### Backend لا يعمل على Railway؟
- ✅ تحقق من Logs في Railway Dashboard
- ✅ تأكد من أن `nixpacks.toml` موجود
- ✅ تأكد من أن `package.json` يحتوي على `start` script

### CORS errors؟
- ✅ CORS مضبوط في `server.js` على `origin: "*"` (يسمح بكل المصادر)
- ✅ إذا استمرت المشكلة، أضف Netlify URL إلى CORS whitelist

## ملاحظات

- **لا تنشر `server.js` على Netlify** - لن يعمل
- **Backend يحتاج Chromium** - Railway و Render يدعمانه
- **WebSockets ضرورية** - تأكد من أن مزود الاستضافة يدعمها
- **المتغيرات البيئية** - `NEXT_PUBLIC_*` متاحة في المتصفح

## الدعم

إذا استمرت المشاكل:
1. تحقق من Logs في Railway/Netlify
2. افتح Console في المتصفح (F12)
3. تحقق من Network tab لرؤية طلبات socket.io
