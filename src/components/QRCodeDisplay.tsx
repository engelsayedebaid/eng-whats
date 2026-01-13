"use client";

import { QRCodeSVG } from "qrcode.react";
import { useSocket } from "@/context/SocketContext";
import { Loader2, Smartphone, CheckCircle2 } from "lucide-react";

export default function QRCodeDisplay() {
  const { isConnected, isReady, qrCode } = useSocket();

  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 p-8">
        <Loader2 className="w-12 h-12 animate-spin text-green-500" />
        <p className="text-gray-400">جاري الاتصال بالخادم...</p>
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

  if (!qrCode) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 p-8">
        <Loader2 className="w-12 h-12 animate-spin text-green-500" />
        <p className="text-gray-400">جاري تحميل رمز QR...</p>
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
    </div>
  );
}
