"use client";

import { QRCodeSVG } from "qrcode.react";
import { useSocket } from "@/context/SocketContext";
import { Loader2, Smartphone, CheckCircle2, AlertCircle, RefreshCw } from "lucide-react";
import { useState } from "react";

export default function QRCodeDisplay() {
  const { isConnected, isReady, qrCode, connectionError, clearSessions } = useSocket();
  const [isClearing, setIsClearing] = useState(false);

  if (connectionError) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 p-8">
        <AlertCircle className="w-12 h-12 text-red-500" />
        <p className="text-red-400 text-center font-semibold">خطأ في الاتصال</p>
        <p className="text-gray-400 text-sm text-center max-w-md">{connectionError}</p>
        <div className="mt-4 p-4 bg-yellow-900/20 border border-yellow-700/50 rounded-lg text-sm text-yellow-300 max-w-md">
          <p className="font-semibold mb-2">💡 الحل:</p>
          <ol className="list-decimal list-inside space-y-1 text-right">
            <li>تأكد من نشر الخادم الخلفي (server.js) على Railway أو Render أو VPS</li>
            <li>أضف متغير البيئة NEXT_PUBLIC_SOCKET_URL في Netlify</li>
            <li>أعد نشر الموقع بعد إضافة المتغير</li>
          </ol>
        </div>
      </div>
    );
  }

  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 p-8">
        <Loader2 className="w-12 h-12 animate-spin text-green-500" />
        <p className="text-gray-400">جاري الاتصال بالخادم...</p>
        <p className="text-gray-500 text-xs text-center max-w-md">
          {process.env.NEXT_PUBLIC_SOCKET_URL 
            ? `الاتصال بـ: ${process.env.NEXT_PUBLIC_SOCKET_URL}`
            : "الاتصال بالخادم المحلي..."}
        </p>
      </div>
    );
  }

  if (isReady) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 p-8">
        <CheckCircle2 className="w-16 h-16 text-green-500" />
        <p className="text-xl font-semibold text-white">تم تسجيل الدخول بنجاح!</p>
        <p className="text-gray-400">يمكنك الآن استخدام التطبيق</p>
      </div>
    );
  }

  const handleClearSessions = () => {
    if (window.confirm("هل أنت متأكد من مسح جميع الجلسات؟ سيتم إعادة تهيئة الحساب وستحتاج لمسح QR جديد.")) {
      setIsClearing(true);
      clearSessions();
      setTimeout(() => setIsClearing(false), 3000);
    }
  };

  if (!qrCode) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 p-8">
        <Loader2 className="w-12 h-12 animate-spin text-green-500" />
        <p className="text-gray-400">جاري تحميل رمز QR...</p>
        {isConnected && !isReady && (
          <button
            onClick={handleClearSessions}
            disabled={isClearing}
            className="mt-4 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-600 text-white rounded-lg flex items-center gap-2 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${isClearing ? 'animate-spin' : ''}`} />
            {isClearing ? 'جاري المسح...' : 'مسح الجلسات وإعادة البدء'}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-6 p-8">
      <div className="flex items-center gap-3">
        <Smartphone className="w-8 h-8 text-green-500" />
        <h2 className="text-2xl font-bold text-white">مسح رمز QR</h2>
      </div>
      <div className="bg-white p-4 rounded-2xl shadow-lg">
        <QRCodeSVG value={qrCode} size={280} level="M" />
      </div>
      <div className="text-center space-y-2">
        <p className="text-gray-300">
          افتح واتساب على هاتفك
        </p>
        <p className="text-gray-400 text-sm">
          اذهب إلى الإعدادات {">"} الأجهزة المرتبطة {">"} ربط جهاز
        </p>
      </div>
      <button
        onClick={handleClearSessions}
        disabled={isClearing}
        className="mt-4 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-600 text-white rounded-lg flex items-center gap-2 transition-colors text-sm"
      >
        <RefreshCw className={`w-4 h-4 ${isClearing ? 'animate-spin' : ''}`} />
        {isClearing ? 'جاري المسح...' : 'مسح الجلسات وإعادة البدء'}
      </button>
    </div>
  );
}
