"use client";

import { useSocket } from "@/context/SocketContext";

export function ConnectionStatus() {
  const { isConnected, isReady, connectionError, connectionHealth, requestReconnect } = useSocket();

  const getStatusColor = () => {
    if (!isConnected) return 'bg-red-500';
    if (!isReady) return 'bg-yellow-500';
    if (connectionHealth.status === 'healthy') return 'bg-green-500';
    if (connectionHealth.status === 'degraded') return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const getStatusText = () => {
    if (!isConnected) return 'غير متصل';
    if (!isReady) return 'جاري الاتصال...';
    if (connectionHealth.status === 'healthy') return 'متصل';
    if (connectionHealth.status === 'degraded') return 'اتصال غير مستقر';
    return 'خطأ في الاتصال';
  };

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-800/50 rounded-full backdrop-blur-sm">
      <div className={`w-2 h-2 rounded-full ${getStatusColor()} animate-pulse`} />
      <span className="text-xs text-gray-300">{getStatusText()}</span>

      {connectionHealth.canReconnect && (
        <button
          onClick={requestReconnect}
          className="text-xs text-blue-400 hover:text-blue-300 transition-colors mr-2"
        >
          إعادة الاتصال
        </button>
      )}

      {connectionError && connectionHealth.status !== 'healthy' && (
        <span className="text-xs text-red-400 max-w-xs truncate" title={connectionError}>
          {connectionError}
        </span>
      )}
    </div>
  );
}
