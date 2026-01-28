"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSocket } from "@/context/SocketContext";
import {
  MessageCircle,
  BarChart3,
  Settings,
  LogOut,
  Menu,
  X,
  Wifi,
  WifiOff,
  Heart,
} from "lucide-react";
import ExportButton from "./ExportButton";
import AccountDropdown from "./AccountDropdown";

const navItems = [
  { href: "/dashboard/chats", label: "المحادثات", icon: MessageCircle },
  { href: "/dashboard/analytics", label: "التحليلات", icon: BarChart3 },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { isConnected, isReady, logout } = useSocket();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      {/* Mobile Toggle */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed top-4 right-4 z-50 lg:hidden p-2 bg-[#202c33] rounded-lg text-white"
      >
        {isOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
      </button>

      {/* Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 lg:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed lg:static inset-y-0 right-0 z-40 w-64 h-screen bg-[#111b21] border-l border-gray-700 transform transition-transform duration-300 flex-shrink-0 overflow-y-auto ${isOpen ? "translate-x-0" : "translate-x-full lg:translate-x-0"
          }`}
      >
        <div className="flex flex-col h-full p-4">
          {/* Logo */}
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-green-500 to-teal-600 flex items-center justify-center">
              <MessageCircle className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 style={{ fontFamily: "'Poppins', 'Segoe UI', sans-serif" }} className="text-lg font-bold text-white tracking-tight">
                <span className="text-green-400">Eng</span> WA Manager
              </h1>
              <div className="flex items-center gap-1 text-xs">
                {isConnected ? (
                  <>
                    <Wifi className="w-3 h-3 text-green-500" />
                    <span className="text-green-500">متصل</span>
                  </>
                ) : (
                  <>
                    <WifiOff className="w-3 h-3 text-red-500" />
                    <span className="text-red-500">غير متصل</span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Account Dropdown */}
          <div className="mb-4">
            <AccountDropdown />
          </div>

          {/* Navigation */}
          <nav className="flex-1 space-y-2">
            {navItems.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setIsOpen(false)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${isActive
                    ? "bg-green-600 text-white"
                    : "text-gray-300 hover:bg-[#202c33] hover:text-white"
                    }`}
                >
                  <item.icon className="w-5 h-5" />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          {/* Export Button */}
          <div className="mb-4">
            <ExportButton />
          </div>

          {/* Logout */}
          {isReady && (
            <button
              onClick={() => {
                logout();
                setIsOpen(false);
                // إعادة التوجيه إلى الصفحة الرئيسية بعد logout
                setTimeout(() => {
                  router.push("/");
                }, 500);
              }}
              className="flex items-center gap-3 px-4 py-3 rounded-lg text-red-400 hover:bg-red-500/10 transition-colors w-full"
            >
              <LogOut className="w-5 h-5" />
              تسجيل الخروج
            </button>
          )}

          {/* Version & Credits */}
          <div className="mt-auto pt-4 border-t border-gray-700/50">
            <div className="flex flex-col items-center gap-2 text-center">
              {/* Made with love */}
              <div className="flex items-center gap-1.5 text-xs text-gray-400">
                <span>صنع بواسطه</span>
                <Heart className="w-3.5 h-3.5 text-red-500 fill-red-500 animate-pulse" />
              </div>
              <a
                href="https://github.com/eng.elsayedebaid"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-green-400 hover:text-green-300 transition-colors font-medium"
              >
                eng.elsayedebaid
              </a>
              {/* Version */}
              <div className="text-xs text-gray-500 mt-1">
                v2.1.0
              </div>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
