"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSocket } from "@/context/SocketContext";
import Sidebar from "@/components/Sidebar";
import { Loader2 } from "lucide-react";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { isReady, isConnected } = useSocket();

  useEffect(() => {
    if (isConnected && !isReady) {
      router.push("/");
    }
  }, [isConnected, isReady, router]);

  if (!isConnected) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0b141a]">
        <Loader2 className="w-12 h-12 animate-spin text-green-500" />
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-[#0b141a] overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
