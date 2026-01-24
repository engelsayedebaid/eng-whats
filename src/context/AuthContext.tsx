"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api";

interface User {
  id: string;
  email: string;
  name: string;
  role: string;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  register: (email: string, password: string, name: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const STORAGE_KEY = "whatsapp_pro_auth";
const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL || "https://resilient-scorpion-536.convex.cloud";

// Create Convex client
const convex = new ConvexHttpClient(CONVEX_URL);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Load user from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const userData = JSON.parse(stored);
        setUser(userData);
      } catch (e) {
        localStorage.removeItem(STORAGE_KEY);
      }
    }
    setIsLoading(false);
  }, []);

  const login = async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const result = await convex.mutation(api.auth.login, { email, password });

      if (result.success && result.user) {
        setUser(result.user);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(result.user));
        return { success: true };
      }

      return { success: false, error: "فشل تسجيل الدخول" };
    } catch (error: unknown) {
      console.error("Login error:", error);
      const errorMessage = error instanceof Error ? error.message : "حدث خطأ غير متوقع";
      // Extract meaningful error message
      if (errorMessage.includes("البريد الإلكتروني أو كلمة المرور غير صحيحة")) {
        return { success: false, error: "البريد الإلكتروني أو كلمة المرور غير صحيحة" };
      }
      if (errorMessage.includes("الحساب معطل")) {
        return { success: false, error: "الحساب معطل" };
      }
      return { success: false, error: "فشل تسجيل الدخول - تحقق من البيانات" };
    }
  };

  const register = async (email: string, password: string, name: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const result = await convex.mutation(api.auth.register, { email, password, name });

      if (result.success) {
        // Auto login after registration
        const loginResult = await login(email, password);
        return loginResult;
      }

      return { success: false, error: "فشل التسجيل" };
    } catch (error: unknown) {
      console.error("Register error:", error);
      const errorMessage = error instanceof Error ? error.message : "حدث خطأ غير متوقع";
      if (errorMessage.includes("البريد الإلكتروني مستخدم")) {
        return { success: false, error: "البريد الإلكتروني مستخدم بالفعل" };
      }
      if (errorMessage.includes("كلمة المرور يجب أن تكون")) {
        return { success: false, error: "كلمة المرور يجب أن تكون 6 أحرف على الأقل" };
      }
      return { success: false, error: "فشل التسجيل - تحقق من البيانات" };
    }
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem(STORAGE_KEY);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        login,
        register,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
