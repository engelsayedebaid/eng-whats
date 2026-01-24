"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSocket } from "@/context/SocketContext";
import { useAuth } from "@/context/AuthContext";
import { QRCodeSVG } from "qrcode.react";
import {
  Loader2,
  Smartphone,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  User,
  Plus,
  Check,
  Trash2,
  MessageCircle,
  Users,
  ArrowRight,
  Zap,
  Shield,
  Cloud,
  Mail,
  Lock,
  Eye,
  EyeOff,
  LogOut
} from "lucide-react";

type AuthTab = "login" | "register";
type MainTab = "auth" | "whatsapp" | "accounts" | "preview";

export default function LoginPage() {
  const router = useRouter();
  const {
    isConnected,
    isReady,
    qrCode,
    connectionError,
    clearSessions,
    accounts,
    currentAccountId,
    addAccount,
    switchAccount,
    deleteAccount,
    chats
  } = useSocket();

  const { user, isAuthenticated, isLoading: authLoading, login, register, logout } = useAuth();

  const [isClearing, setIsClearing] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newAccountName, setNewAccountName] = useState("");
  const [activeTab, setActiveTab] = useState<MainTab>("auth");
  const [authTab, setAuthTab] = useState<AuthTab>("login");

  // Auth form state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [authError, setAuthError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const currentAccount = accounts.find(a => a.id === currentAccountId);

  // Calculate chat stats
  const totalChats = chats.length;
  const groupChats = chats.filter(c => c.isGroup).length;
  const privateChats = totalChats - groupChats;

  // Redirect to WhatsApp tab after auth
  useEffect(() => {
    if (isAuthenticated && activeTab === "auth") {
      setActiveTab("whatsapp");
    }
  }, [isAuthenticated, activeTab]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError("");
    setIsSubmitting(true);

    try {
      const result = await login(email, password);
      if (!result.success) {
        setAuthError(result.error || "فشل تسجيل الدخول");
      }
    } catch (error) {
      setAuthError("حدث خطأ غير متوقع");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError("");
    setIsSubmitting(true);

    if (!name.trim()) {
      setAuthError("الرجاء إدخال الاسم");
      setIsSubmitting(false);
      return;
    }

    try {
      const result = await register(email, password, name);
      if (!result.success) {
        setAuthError(result.error || "فشل التسجيل");
      }
    } catch (error) {
      setAuthError("حدث خطأ غير متوقع");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddAccount = () => {
    if (newAccountName.trim()) {
      addAccount(newAccountName.trim());
      setNewAccountName("");
      setShowAddForm(false);
    }
  };

  const handleSwitchAccount = (accountId: string) => {
    switchAccount(accountId);
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

  const handleClearSessions = () => {
    if (window.confirm("هل أنت متأكد من مسح جميع الجلسات؟")) {
      setIsClearing(true);
      clearSessions();
      setTimeout(() => setIsClearing(false), 3000);
    }
  };

  const goToDashboard = () => {
    router.push("/dashboard/chats");
  };

  const handleLogout = () => {
    logout();
    setActiveTab("auth");
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#0a0f14] via-[#0b141a] to-[#111b21]">
        <Loader2 className="w-12 h-12 animate-spin text-green-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0a0f14] via-[#0b141a] to-[#111b21]">
      {/* Animated Background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-green-500/10 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-teal-500/10 rounded-full blur-3xl animate-pulse delay-1000"></div>
      </div>

      <div className="relative z-10 min-h-screen flex">
        {/* Left Side - Branding & Features */}
        <div className="hidden lg:flex lg:w-1/2 flex-col justify-center items-center p-12 border-r border-gray-800">
          <div className="max-w-md text-center">
            {/* Logo */}
            <div className="w-24 h-24 mx-auto mb-8 rounded-2xl bg-gradient-to-br from-green-500 to-teal-600 flex items-center justify-center shadow-2xl shadow-green-500/20">
              <svg viewBox="0 0 24 24" className="w-14 h-14 text-white fill-current">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
              </svg>
            </div>

            <h1 className="text-4xl font-bold text-white mb-4">واتساب برو</h1>
            <p className="text-gray-400 text-lg mb-12">
              نظام متقدم لإدارة وتحليل محادثات واتساب بتقنية السحابة
            </p>

            {/* Features */}
            <div className="grid grid-cols-2 gap-4 text-right">
              <div className="p-4 bg-white/5 backdrop-blur-sm rounded-xl border border-gray-800 hover:border-green-500/50 transition-colors">
                <div className="w-10 h-10 mb-3 rounded-lg bg-green-500/20 flex items-center justify-center">
                  <Zap className="w-5 h-5 text-green-400" />
                </div>
                <h3 className="font-semibold text-white mb-1">مزامنة فورية</h3>
                <p className="text-sm text-gray-400">تحديث تلقائي للمحادثات</p>
              </div>
              <div className="p-4 bg-white/5 backdrop-blur-sm rounded-xl border border-gray-800 hover:border-green-500/50 transition-colors">
                <div className="w-10 h-10 mb-3 rounded-lg bg-teal-500/20 flex items-center justify-center">
                  <Cloud className="w-5 h-5 text-teal-400" />
                </div>
                <h3 className="font-semibold text-white mb-1">حفظ سحابي</h3>
                <p className="text-sm text-gray-400">بياناتك آمنة في السحابة</p>
              </div>
              <div className="p-4 bg-white/5 backdrop-blur-sm rounded-xl border border-gray-800 hover:border-green-500/50 transition-colors">
                <div className="w-10 h-10 mb-3 rounded-lg bg-blue-500/20 flex items-center justify-center">
                  <Users className="w-5 h-5 text-blue-400" />
                </div>
                <h3 className="font-semibold text-white mb-1">حسابات متعددة</h3>
                <p className="text-sm text-gray-400">إدارة عدة حسابات</p>
              </div>
              <div className="p-4 bg-white/5 backdrop-blur-sm rounded-xl border border-gray-800 hover:border-green-500/50 transition-colors">
                <div className="w-10 h-10 mb-3 rounded-lg bg-purple-500/20 flex items-center justify-center">
                  <Shield className="w-5 h-5 text-purple-400" />
                </div>
                <h3 className="font-semibold text-white mb-1">أمان عالي</h3>
                <p className="text-sm text-gray-400">تشفير end-to-end</p>
              </div>
            </div>
          </div>
        </div>

        {/* Right Side - Login */}
        <div className="w-full lg:w-1/2 flex flex-col justify-center items-center p-6 lg:p-12">
          <div className="w-full max-w-md">
            {/* Mobile Logo */}
            <div className="lg:hidden text-center mb-8">
              <div className="w-16 h-16 mx-auto mb-4 rounded-xl bg-gradient-to-br from-green-500 to-teal-600 flex items-center justify-center">
                <svg viewBox="0 0 24 24" className="w-10 h-10 text-white fill-current">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347" />
                </svg>
              </div>
              <h1 className="text-2xl font-bold text-white">واتساب برو</h1>
            </div>

            {/* User Info & Logout Button */}
            {isAuthenticated && user && (
              <div className="flex items-center justify-between mb-4 p-3 bg-[#111b21] rounded-xl border border-gray-800">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-green-500 to-teal-600 flex items-center justify-center">
                    <User className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-white">{user.name}</div>
                    <div className="text-xs text-gray-400">{user.email}</div>
                  </div>
                </div>
                <button
                  onClick={handleLogout}
                  className="p-2 hover:bg-red-500/20 rounded-lg transition-colors"
                  title="تسجيل الخروج"
                >
                  <LogOut className="w-5 h-5 text-red-400" />
                </button>
              </div>
            )}

            {/* Tabs - Only show when authenticated */}
            {isAuthenticated && (
              <div className="flex bg-[#111b21] rounded-xl p-1 mb-6">
                <button
                  onClick={() => setActiveTab("whatsapp")}
                  className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-medium transition-all ${activeTab === "whatsapp"
                    ? "bg-green-600 text-white shadow-lg"
                    : "text-gray-400 hover:text-white"
                    }`}
                >
                  واتساب
                </button>
                <button
                  onClick={() => setActiveTab("accounts")}
                  className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-medium transition-all ${activeTab === "accounts"
                    ? "bg-green-600 text-white shadow-lg"
                    : "text-gray-400 hover:text-white"
                    }`}
                >
                  الحسابات ({accounts.length})
                </button>
                {isReady && (
                  <button
                    onClick={() => setActiveTab("preview")}
                    className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-medium transition-all ${activeTab === "preview"
                      ? "bg-green-600 text-white shadow-lg"
                      : "text-gray-400 hover:text-white"
                      }`}
                  >
                    المحادثات
                  </button>
                )}
              </div>
            )}

            {/* Main Card */}
            <div className="bg-[#111b21] rounded-2xl shadow-2xl border border-gray-800 overflow-hidden">

              {/* Auth Tab - Email/Password Login */}
              {activeTab === "auth" && !isAuthenticated && (
                <div className="p-6">
                  {/* Auth Tabs */}
                  <div className="flex mb-6">
                    <button
                      onClick={() => { setAuthTab("login"); setAuthError(""); }}
                      className={`flex-1 py-2 text-sm font-medium border-b-2 transition-colors ${authTab === "login"
                        ? "border-green-500 text-green-400"
                        : "border-transparent text-gray-400 hover:text-white"
                        }`}
                    >
                      تسجيل الدخول
                    </button>
                    <button
                      onClick={() => { setAuthTab("register"); setAuthError(""); }}
                      className={`flex-1 py-2 text-sm font-medium border-b-2 transition-colors ${authTab === "register"
                        ? "border-green-500 text-green-400"
                        : "border-transparent text-gray-400 hover:text-white"
                        }`}
                    >
                      حساب جديد
                    </button>
                  </div>

                  {/* Error Message */}
                  {authError && (
                    <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm text-center">
                      {authError}
                    </div>
                  )}

                  {/* Login Form */}
                  {authTab === "login" && (
                    <form onSubmit={handleLogin} className="space-y-4">
                      <div>
                        <label className="block text-sm text-gray-400 mb-2">البريد الإلكتروني</label>
                        <div className="relative">
                          <Mail className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                          <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="your@email.com"
                            required
                            className="w-full pr-10 pl-4 py-3 bg-[#202c33] border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-green-500 transition-colors"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm text-gray-400 mb-2">كلمة المرور</label>
                        <div className="relative">
                          <Lock className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                          <input
                            type={showPassword ? "text" : "password"}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="••••••••"
                            required
                            className="w-full pr-10 pl-12 py-3 bg-[#202c33] border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-green-500 transition-colors"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                          >
                            {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                          </button>
                        </div>
                      </div>

                      <button
                        type="submit"
                        disabled={isSubmitting}
                        className="w-full py-3 bg-gradient-to-r from-green-600 to-teal-600 hover:from-green-500 hover:to-teal-500 disabled:from-gray-600 disabled:to-gray-600 text-white font-medium rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-green-500/20"
                      >
                        {isSubmitting ? (
                          <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                          <>
                            تسجيل الدخول
                            <ArrowRight className="w-5 h-5" />
                          </>
                        )}
                      </button>
                    </form>
                  )}

                  {/* Register Form */}
                  {authTab === "register" && (
                    <form onSubmit={handleRegister} className="space-y-4">
                      <div>
                        <label className="block text-sm text-gray-400 mb-2">الاسم</label>
                        <div className="relative">
                          <User className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                          <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="اسمك"
                            required
                            className="w-full pr-10 pl-4 py-3 bg-[#202c33] border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-green-500 transition-colors"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm text-gray-400 mb-2">البريد الإلكتروني</label>
                        <div className="relative">
                          <Mail className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                          <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="your@email.com"
                            required
                            className="w-full pr-10 pl-4 py-3 bg-[#202c33] border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-green-500 transition-colors"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm text-gray-400 mb-2">كلمة المرور</label>
                        <div className="relative">
                          <Lock className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                          <input
                            type={showPassword ? "text" : "password"}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="6 أحرف على الأقل"
                            required
                            minLength={6}
                            className="w-full pr-10 pl-12 py-3 bg-[#202c33] border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-green-500 transition-colors"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                          >
                            {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                          </button>
                        </div>
                      </div>

                      <button
                        type="submit"
                        disabled={isSubmitting}
                        className="w-full py-3 bg-gradient-to-r from-green-600 to-teal-600 hover:from-green-500 hover:to-teal-500 disabled:from-gray-600 disabled:to-gray-600 text-white font-medium rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-green-500/20"
                      >
                        {isSubmitting ? (
                          <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                          <>
                            إنشاء حساب
                            <ArrowRight className="w-5 h-5" />
                          </>
                        )}
                      </button>
                    </form>
                  )}

                  {/* Demo Credentials */}
                  <div className="mt-6 p-4 bg-[#202c33] rounded-xl">
                    <p className="text-xs text-gray-400 mb-2 text-center">للتجربة استخدم:</p>
                    <div className="text-xs text-center">
                      <span className="text-green-400">admin@whatsapp.pro</span>
                      <span className="text-gray-500 mx-2">|</span>
                      <span className="text-green-400">admin123</span>
                    </div>
                  </div>
                </div>
              )}

              {/* WhatsApp Tab */}
              {activeTab === "whatsapp" && isAuthenticated && (
                <div className="p-6">
                  {/* Connection Error */}
                  {connectionError && (
                    <div className="text-center py-8">
                      <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
                      <p className="text-red-400 font-semibold mb-2">خطأ في الاتصال</p>
                      <p className="text-gray-400 text-sm">{connectionError}</p>
                    </div>
                  )}

                  {/* Connecting */}
                  {!isConnected && !connectionError && (
                    <div className="text-center py-12">
                      <Loader2 className="w-16 h-16 animate-spin text-green-500 mx-auto mb-4" />
                      <p className="text-white font-medium mb-2">جاري الاتصال...</p>
                      <p className="text-gray-400 text-sm">الاتصال بخادم واتساب</p>
                    </div>
                  )}

                  {/* Ready - Success */}
                  {isReady && (
                    <div className="text-center py-8">
                      <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-green-500/20 flex items-center justify-center">
                        <CheckCircle2 className="w-12 h-12 text-green-500" />
                      </div>
                      <h2 className="text-2xl font-bold text-white mb-2">تم تسجيل الدخول!</h2>
                      <p className="text-gray-400 mb-6">
                        مرتبط بـ: {currentAccount?.name || "الحساب الحالي"}
                      </p>

                      {/* Stats */}
                      <div className="grid grid-cols-3 gap-3 mb-6">
                        <div className="p-3 bg-[#202c33] rounded-xl">
                          <div className="text-2xl font-bold text-white">{totalChats}</div>
                          <div className="text-xs text-gray-400">محادثة</div>
                        </div>
                        <div className="p-3 bg-[#202c33] rounded-xl">
                          <div className="text-2xl font-bold text-green-400">{privateChats}</div>
                          <div className="text-xs text-gray-400">خاص</div>
                        </div>
                        <div className="p-3 bg-[#202c33] rounded-xl">
                          <div className="text-2xl font-bold text-blue-400">{groupChats}</div>
                          <div className="text-xs text-gray-400">مجموعة</div>
                        </div>
                      </div>

                      <button
                        onClick={goToDashboard}
                        className="w-full py-3 px-6 bg-gradient-to-r from-green-600 to-teal-600 hover:from-green-500 hover:to-teal-500 text-white font-medium rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-green-500/20"
                      >
                        الذهاب للمحادثات
                        <ArrowRight className="w-5 h-5" />
                      </button>
                    </div>
                  )}

                  {/* QR Code Loading */}
                  {isConnected && !isReady && !qrCode && (
                    <div className="text-center py-12">
                      <Loader2 className="w-16 h-16 animate-spin text-green-500 mx-auto mb-4" />
                      <p className="text-white font-medium mb-2">جاري تحميل QR...</p>
                      <p className="text-gray-400 text-sm">انتظر قليلاً</p>

                      <button
                        onClick={handleClearSessions}
                        disabled={isClearing}
                        className="mt-6 px-4 py-2 bg-red-600/20 hover:bg-red-600/30 text-red-400 rounded-lg text-sm flex items-center gap-2 mx-auto transition-colors"
                      >
                        <RefreshCw className={`w-4 h-4 ${isClearing ? 'animate-spin' : ''}`} />
                        {isClearing ? 'جاري...' : 'إعادة البدء'}
                      </button>
                    </div>
                  )}

                  {/* QR Code Display */}
                  {isConnected && !isReady && qrCode && (
                    <div className="text-center py-6">
                      <div className="flex items-center justify-center gap-2 mb-6">
                        <Smartphone className="w-6 h-6 text-green-500" />
                        <h2 className="text-xl font-bold text-white">امسح رمز QR</h2>
                      </div>

                      <div className="bg-white p-4 rounded-2xl inline-block mb-6 shadow-xl">
                        <QRCodeSVG value={qrCode} size={220} level="M" />
                      </div>

                      <div className="space-y-2 text-sm">
                        <p className="text-gray-300">افتح واتساب على هاتفك</p>
                        <p className="text-gray-400">
                          الإعدادات → الأجهزة المرتبطة → ربط جهاز
                        </p>
                      </div>

                      <button
                        onClick={handleClearSessions}
                        disabled={isClearing}
                        className="mt-6 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-sm flex items-center gap-2 mx-auto transition-colors"
                      >
                        <RefreshCw className={`w-4 h-4 ${isClearing ? 'animate-spin' : ''}`} />
                        {isClearing ? 'جاري...' : 'مسح وإعادة البدء'}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Accounts Tab */}
              {activeTab === "accounts" && isAuthenticated && (
                <div className="p-4">
                  <div className="space-y-2 max-h-80 overflow-y-auto">
                    {accounts.map((account) => (
                      <div
                        key={account.id}
                        onClick={() => handleSwitchAccount(account.id)}
                        className={`flex items-center gap-3 p-4 rounded-xl cursor-pointer transition-all ${account.id === currentAccountId
                          ? "bg-green-600/20 border border-green-500/50"
                          : "bg-[#202c33] hover:bg-[#2a3942]"
                          }`}
                      >
                        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-green-500 to-teal-600 flex items-center justify-center flex-shrink-0">
                          <User className="w-6 h-6 text-white" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-white truncate">{account.name}</div>
                          <div className="text-sm text-gray-400">
                            {account.phone || "غير متصل"}
                          </div>
                        </div>
                        {account.id === currentAccountId && (
                          <Check className="w-5 h-5 text-green-400 flex-shrink-0" />
                        )}
                        {accounts.length > 1 && (
                          <button
                            onClick={(e) => handleDeleteAccount(account.id, e)}
                            className="p-2 hover:bg-red-500/20 rounded-lg transition-colors"
                          >
                            <Trash2 className="w-4 h-4 text-red-400" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Add Account */}
                  {!showAddForm ? (
                    <button
                      onClick={() => setShowAddForm(true)}
                      className="w-full mt-4 py-3 px-4 border-2 border-dashed border-gray-600 hover:border-green-500 rounded-xl text-gray-400 hover:text-green-400 flex items-center justify-center gap-2 transition-all"
                    >
                      <Plus className="w-5 h-5" />
                      إضافة حساب جديد
                    </button>
                  ) : (
                    <div className="mt-4 p-4 bg-[#202c33] rounded-xl">
                      <input
                        type="text"
                        value={newAccountName}
                        onChange={(e) => setNewAccountName(e.target.value)}
                        placeholder="اسم الحساب"
                        className="w-full px-4 py-3 bg-[#111b21] border border-gray-600 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-green-500"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleAddAccount();
                          if (e.key === "Escape") {
                            setShowAddForm(false);
                            setNewAccountName("");
                          }
                        }}
                      />
                      <div className="flex gap-2 mt-3">
                        <button
                          onClick={handleAddAccount}
                          className="flex-1 py-2.5 bg-green-600 hover:bg-green-500 rounded-xl text-white font-medium transition-colors"
                        >
                          إضافة
                        </button>
                        <button
                          onClick={() => {
                            setShowAddForm(false);
                            setNewAccountName("");
                          }}
                          className="py-2.5 px-4 bg-gray-600 hover:bg-gray-500 rounded-xl text-white font-medium transition-colors"
                        >
                          إلغاء
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Preview Tab - Recent Chats */}
              {activeTab === "preview" && isReady && isAuthenticated && (
                <div className="p-4">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-medium text-white">آخر المحادثات</h3>
                    <span className="text-sm text-gray-400">{totalChats} محادثة</span>
                  </div>

                  <div className="space-y-2 max-h-72 overflow-y-auto">
                    {chats.slice(0, 10).map((chat) => (
                      <div
                        key={chat.id}
                        className="flex items-center gap-3 p-3 bg-[#202c33] hover:bg-[#2a3942] rounded-xl cursor-pointer transition-all"
                      >
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-gray-600 to-gray-700 flex items-center justify-center flex-shrink-0">
                          {chat.isGroup ? (
                            <Users className="w-5 h-5 text-gray-300" />
                          ) : (
                            <User className="w-5 h-5 text-gray-300" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-white text-sm truncate">{chat.name}</div>
                          <div className="text-xs text-gray-400 truncate">
                            {chat.lastMessage?.body || "لا توجد رسائل"}
                          </div>
                        </div>
                        {chat.unreadCount > 0 && (
                          <div className="w-5 h-5 rounded-full bg-green-500 text-white text-xs flex items-center justify-center">
                            {chat.unreadCount}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  <button
                    onClick={goToDashboard}
                    className="w-full mt-4 py-3 bg-gradient-to-r from-green-600 to-teal-600 hover:from-green-500 hover:to-teal-500 text-white font-medium rounded-xl flex items-center justify-center gap-2 transition-all"
                  >
                    عرض كل المحادثات
                    <ArrowRight className="w-5 h-5" />
                  </button>
                </div>
              )}
            </div>

            {/* Current Account Badge */}
            {isAuthenticated && currentAccount && (
              <div className="mt-4 flex items-center justify-center gap-2 text-sm text-gray-400">
                <div className="w-2 h-2 rounded-full bg-green-500"></div>
                <span>الحساب الحالي: {currentAccount.name}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
