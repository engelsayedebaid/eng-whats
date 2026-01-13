"use client";

import { useState, useEffect, useRef } from "react";
import { useSocket } from "@/context/SocketContext";
import { ChevronDown, Plus, Trash2, Check, User } from "lucide-react";

interface Account {
  id: string;
  name: string;
  phone: string | null;
  isActive: boolean;
}

export default function AccountDropdown() {
  const { socket, currentAccountId, accounts, addAccount, switchAccount, deleteAccount } = useSocket();
  const [isOpen, setIsOpen] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newAccountName, setNewAccountName] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setShowAddForm(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

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
    setIsOpen(false);
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

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Dropdown Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between gap-2 px-4 py-3 rounded-lg bg-[#202c33] hover:bg-[#2a3942] transition-colors text-white"
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-green-500 to-teal-600 flex items-center justify-center flex-shrink-0">
            <User className="w-4 h-4 text-white" />
          </div>
          <div className="flex-1 min-w-0 text-right">
            <div className="text-sm font-medium truncate">
              {currentAccount?.name || "لا يوجد حساب"}
            </div>
            {currentAccount?.phone && (
              <div className="text-xs text-gray-400 truncate">
                {currentAccount.phone}
              </div>
            )}
          </div>
        </div>
        <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-[#202c33] rounded-lg shadow-2xl border border-gray-700 overflow-hidden z-[9999] max-h-80 overflow-y-auto">
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
                {account.isActive && (
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
  );
}
