"use client";

import { QRCodeSVG } from "qrcode.react";
import { useSocket } from "@/context/SocketContext";
import { Loader2, Smartphone, CheckCircle2, AlertCircle, RefreshCw, User, ChevronDown, Plus, Check, Trash2 } from "lucide-react";
import { useState } from "react";

export default function QRCodeDisplay() {
  const { isConnected, isReady, qrCode, connectionError, clearSessions, accounts, currentAccountId, addAccount, switchAccount, deleteAccount } = useSocket();
  const [isClearing, setIsClearing] = useState(false);
  const [showAccountsDropdown, setShowAccountsDropdown] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newAccountName, setNewAccountName] = useState("");

  const currentAccount = accounts.find(a => a.id === currentAccountId);

  const handleAddAccount = () => {
    if (newAccountName.trim()) {
      addAccount(newAccountName.trim());
      setNewAccountName("");
      setShowAddForm(false);
    }
  };

  const handleSwitchAccount = (accountId: string) => {
    switchAccount(accountId);
    setShowAccountsDropdown(false);
  };

  const handleDeleteAccount = (accountId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (accounts.length <= 1) {
      alert("لا يمكن حذف الحساب الوحيد");
      return;
    }
    if (confirm("هل أنت متأكد من حذف هذا الحساب؟")) {
      deleteAccount(accountId);
    }
  };

  // Accounts Dropdown Component
  const AccountsSection = () => (
    <div className="w-full max-w-sm mb-6">
      <div className="relative">
        {/* Dropdown Button */}
        <button
          onClick={() => setShowAccountsDropdown(!showAccountsDropdown)}
          className="w-full flex items-center justify-between gap-2 px-4 py-3 rounded-lg bg-[#202c33] hover:bg-[#2a3942] transition-colors text-white border border-gray-600"
        >
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-green-500 to-teal-600 flex items-center justify-center flex-shrink-0">
              <User className="w-4 h-4 text-white" />
            </div>
            <div className="flex-1 min-w-0 text-right">
              <div className="text-sm font-medium truncate">
                {currentAccount?.name || "اختر حساب"}
              </div>
              <div className="text-xs text-gray-400">
                {accounts.length} حساب متاح
              </div>
            </div>
          </div>
          <ChevronDown className={`w-4 h-4 transition-transform ${showAccountsDropdown ? "rotate-180" : ""}`} />
        </button>

        {/* Dropdown Menu */}
        {showAccountsDropdown && (
          <div className="absolute top-full left-0 right-0 mt-2 bg-[#202c33] rounded-lg shadow-2xl border border-gray-700 overflow-hidden z-50 max-h-80 overflow-y-auto">
            {/* Accounts List */}
            <div className="py-1">
              {accounts.map((account) => (
                <div
                  key={account.id}
                  className="flex items-center gap-2 px-4 py-3 hover:bg-[#2a3942] transition-colors cursor-pointer group"
                  onClick={() => handleSwitchAccount(account.id)}
                >
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-green-500 to-teal-600 flex items-center justify-center flex-shrink-0">
                    <User className="w-4 h-4 text-white" />
                  </div>
                  <div className="flex-1 min-w-0 text-right">
                    <div className="text-sm font-medium text-white truncate">
                      {account.name}
                    </div>
                    {account.phone && (
                      <div className="text-xs text-gray-400 truncate">
                        {account.phone}
                      </div>
                    )}
                  </div>
                  {account.id === currentAccountId && (
                    <Check className="w-4 h-4 text-green-400 flex-shrink-0" />
                  )}
                  {accounts.length > 1 && (
                    <button
                      onClick={(e) => handleDeleteAccount(account.id, e)}
                      className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-500/20 rounded transition-all"
                    >
                      <Trash2 className="w-4 h-4 text-red-400" />
                    </button>
                  )}
                </div>
              ))}
            </div>

            {/* Add Account Button */}
            {!showAddForm ? (
              <button
                onClick={() => setShowAddForm(true)}
                className="w-full flex items-center gap-2 px-4 py-3 border-t border-gray-700 hover:bg-[#2a3942] transition-colors text-green-400"
              >
                <Plus className="w-4 h-4" />
                <span className="text-sm font-medium">إضافة حساب جديد</span>
              </button>
            ) : (
              <div className="p-4 border-t border-gray-700">
                <input
                  type="text"
                  value={newAccountName}
                  onChange={(e) => setNewAccountName(e.target.value)}
                  placeholder="اسم الحساب"
                  className="w-full px-3 py-2 bg-[#111b21] border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-green-500"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      handleAddAccount();
                    } else if (e.key === "Escape") {
                      setShowAddForm(false);
                      setNewAccountName("");
                    }
                  }}
                />
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={handleAddAccount}
                    className="flex-1 px-3 py-2 bg-green-600 hover:bg-green-700 rounded-lg text-white text-sm font-medium transition-colors"
                  >
                    إضافة
                  </button>
                  <button
                    onClick={() => {
                      setShowAddForm(false);
                      setNewAccountName("");
                    }}
                    className="px-3 py-2 bg-gray-600 hover:bg-gray-700 rounded-lg text-white text-sm font-medium transition-colors"
                  >
                    إلغاء
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );

  if (connectionError) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 p-8">
        <AccountsSection />
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
        <AccountsSection />
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
      <AccountsSection />
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
