"use client";

import { useEffect } from "react";
import { useSocket } from "@/context/SocketContext";
import AnalyticsCharts from "@/components/AnalyticsCharts";

export default function AnalyticsPage() {
  const { fetchChats, isReady } = useSocket();

  useEffect(() => {
    if (isReady) {
      fetchChats();
    }
  }, [isReady, fetchChats]);

  return <AnalyticsCharts />;
}
