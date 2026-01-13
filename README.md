# WhatsApp Pro - نظام متقدم لإدارة وتحليل محادثات واتساب

## المشكلة الحالية

إذا كنت تواجه أخطاء 404 عند الاتصال بـ socket.io، فهذا يعني أن الخادم الخلفي (backend) غير متاح. Netlify لا يدعم تشغيل خوادم Node.js طويلة المدى مع WebSockets.

## الحل: نشر الخادم الخلفي بشكل منفصل

### الخيار 1: Railway (موصى به)

1. قم بإنشاء حساب على [Railway](https://railway.app)
2. اربط مستودع GitHub الخاص بك
3. Railway سيكتشف تلقائياً `nixpacks.toml` وسيقوم بنشر الخادم
4. بعد النشر، احصل على URL الخاص بالخادم (مثل: `https://your-app.railway.app`)
5. في Netlify، أضف متغير البيئة:
   - `NEXT_PUBLIC_SOCKET_URL=https://your-app.railway.app`

### الخيار 2: Render

1. قم بإنشاء حساب على [Render](https://render.com)
2. أنشئ "Web Service" جديد
3. اربط مستودع GitHub
4. استخدم `Dockerfile` أو قم بتعيين:
   - Build Command: `npm run build`
   - Start Command: `npm start`
5. احصل على URL وأضفه إلى Netlify كمتغير بيئة

### الخيار 3: Heroku

1. قم بإنشاء حساب على [Heroku](https://heroku.com)
2. استخدم Heroku CLI:
   ```bash
   heroku create your-app-name
   git push heroku main
   ```
3. أضف URL إلى Netlify

### الخيار 4: VPS (خادم خاص)

إذا كان لديك VPS، يمكنك:
1. نشر الكود على الخادم
2. استخدام PM2 لتشغيل الخادم:
   ```bash
   npm install -g pm2
   pm2 start server.js --name whatsapp-pro
   pm2 save
   pm2 startup
   ```
3. إعداد Nginx كـ reverse proxy
4. أضف URL إلى Netlify

## إعداد Netlify

بعد نشر الخادم الخلفي:

1. اذهب إلى إعدادات Netlify → Environment Variables
2. أضف:
   - `NEXT_PUBLIC_SOCKET_URL` = URL الخاص بخادمك الخلفي
3. أعد نشر الموقع

## التطوير المحلي

1. قم بتثبيت المتطلبات:
   ```bash
   npm install
   ```

2. قم بتشغيل الخادم:
   ```bash
   npm run dev
   ```

3. سيعمل التطبيق على `http://localhost:3000`

## ملاحظات مهمة

- **الخادم الخلفي ضروري**: لا يمكن تشغيل `server.js` على Netlify
- **WebSockets**: تأكد من أن مزود الاستضافة يدعم WebSockets
- **Chromium**: الخادم يحتاج إلى Chromium لتشغيل WhatsApp Web.js
- **المتغيرات البيئية**: تأكد من إعداد `NEXT_PUBLIC_SOCKET_URL` في Netlify

## البنية

- `server.js` - الخادم الخلفي مع Socket.io و WhatsApp Web.js
- `src/` - تطبيق Next.js (Frontend)
- `nixpacks.toml` - إعدادات Railway
- `Dockerfile` - إعدادات Docker

## الدعم

إذا واجهت مشاكل، تأكد من:
1. أن الخادم الخلفي يعمل ويستمع على المنفذ الصحيح
2. أن CORS مسموح في `server.js` (موجود بالفعل)
3. أن `NEXT_PUBLIC_SOCKET_URL` مضبوط بشكل صحيح في Netlify
