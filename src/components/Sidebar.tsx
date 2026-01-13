"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
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
} from "lucide-react";
import ExportButton from "./ExportButton";

const navItems = [
  { href: "/dashboard/chats", label: "المحادثات", icon: MessageCircle },
  { href: "/dashboard/analytics", label: "التحليلات", icon: BarChart3 },
];

export default function Sidebar() {
  const pathname = usePathname();
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
          <div className="flex items-center gap-3 mb-8">
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
              }}
              className="flex items-center gap-3 px-4 py-3 rounded-lg text-red-400 hover:bg-red-500/10 transition-colors"
            >
              <LogOut className="w-5 h-5" />
              تسجيل الخروج
            </button>
          )}
        </div>
      </aside>
    </>
  );
}
