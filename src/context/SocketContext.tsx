"use client";

import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import { io, Socket } from "socket.io-client";

interface Participant {
  id: string;
  name: string;
  isAdmin: boolean;
  isSuperAdmin: boolean;
}

interface Chat {
  id: string;
  name: string;
  phone: string;
  profilePic: string | null;
  isGroup: boolean;
  participants: Participant[];
  participantCount: number;
  unreadCount: number;
  lastMessage: {
    body: string;
    fromMe: boolean;
    timestamp: number;
    type: string;
    typeLabel: string;
    senderName: string;
  } | null;
  timestamp: number;
}

interface Message {
  id: string;
  body: string;
  fromMe: boolean;
  timestamp: number;
  type: string;
  hasMedia?: boolean;
  mediaUrl?: string | null;
  mimetype?: string | null;
  filename?: string | null;
  duration?: number | null;
  senderName?: string | null;
}

interface SyncProgress {
  status: "idle" | "started" | "fetching" | "processing" | "completed" | "error" | "cancelled" | "quick" | "info";
  message: string;
  progress: number;
  total: number;
  current: number;
  chatName?: string;
  successCount?: number;
  errorCount?: number;
}

interface SearchResult {
  id: string;
  chatId: string;
  chatName: string;
  chatPhone: string;
  isGroup: boolean;
  body: string;
  timestamp: number;
  fromMe: boolean;
  senderName: string;
  type: string;
}

interface SearchState {
  status: "idle" | "searching" | "completed" | "error";
  message: string;
  progress: number;
  results: SearchResult[];
  query: string;
}

interface Account {
  id: string;
  name: string;
  phone: string | null;
  isActive: boolean;
  userId?: string;
}

interface PhoneState {
  state: string;
  isPhoneOnline: boolean;
  message: string;
  multiDeviceActive: boolean;
}

interface SocketContextType {
  socket: Socket | null;
  isConnected: boolean;
  isReady: boolean;
  isLoading: boolean;
  qrCode: string | null;
  chats: Chat[];
  messages: Record<string, Message[]>;
  syncProgress: SyncProgress;
  searchState: SearchState;
  privacyMode: boolean;
  accounts: Account[];
  currentAccountId: string | null;
  connectionError: string | null;
  connectionHealth: {
    status: 'healthy' | 'degraded' | 'error' | 'unknown';
    message: string;
    canReconnect: boolean;
  };
  phoneState: PhoneState;
  multiDeviceEnabled: boolean;
  setPrivacyMode: (value: boolean) => void;
  fetchChats: () => void;
  fetchMessages: (chatId: string) => void;
  syncAllChats: () => void; // No limit - syncs all chats
  quickSync: () => void;
  fetchProfilePics: (chatIds: string[]) => void;
  searchMessages: (query: string) => void;
  sendMessage: (chatId: string, message: string) => void;
  clearSearch: () => void;
  logout: () => void;
  addAccount: (name: string) => void;
  switchAccount: (accountId: string) => void;
  deleteAccount: (accountId: string) => void;
  clearSessions: () => void;
  requestReconnect: () => void;
}

const defaultSyncProgress: SyncProgress = {
  status: "idle",
  message: "",
  progress: 0,
  total: 0,
  current: 0,
};

const defaultSearchState: SearchState = {
  status: "idle",
  message: "",
  progress: 0,
  results: [],
  query: "",
};

const SocketContext = createContext<SocketContextType | null>(null);

// Get current user from localStorage
function getCurrentUserId(): string | null {
  if (typeof window === 'undefined') return null;
  const stored = localStorage.getItem('whatsapp_pro_auth');
  if (stored) {
    try {
      const user = JSON.parse(stored);
      return user.id || null;
    } catch {
      return null;
    }
  }
  return null;
}

export function SocketProvider({ children }: { children: ReactNode }) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [chats, setChats] = useState<Chat[]>([]);
  const [messages, setMessages] = useState<Record<string, Message[]>>({});
  const [syncProgress, setSyncProgress] = useState<SyncProgress>(defaultSyncProgress);
  const [searchState, setSearchState] = useState<SearchState>(defaultSearchState);
  const [privacyMode, setPrivacyMode] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [currentAccountId, setCurrentAccountId] = useState<string | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [connectionHealth, setConnectionHealth] = useState<{
    status: 'healthy' | 'degraded' | 'error' | 'unknown';
    message: string;
    canReconnect: boolean;
  }>({ status: 'unknown', message: '', canReconnect: false });
  const [phoneState, setPhoneState] = useState<PhoneState>({
    state: 'UNKNOWN',
    isPhoneOnline: true,
    message: '',
    multiDeviceActive: true
  });
  const [multiDeviceEnabled, setMultiDeviceEnabled] = useState(true);

  useEffect(() => {
    // Get backend URL from environment variable or default to current origin
    const backendUrl = process.env.NEXT_PUBLIC_SOCKET_URL || (typeof window !== 'undefined' ? window.location.origin : '');

    console.log("Connecting to Socket.io server at:", backendUrl);

    const newSocket = io(backendUrl, {
      // Start with polling then upgrade to websocket for better compatibility
      transports: ['polling', 'websocket'],
      // Allow transport upgrade
      upgrade: true,
      // Reconnection settings - reasonable limits to avoid infinite loops
      reconnection: true,
      reconnectionAttempts: 20, // Try 20 times before showing error
      reconnectionDelay: 1000,
      reconnectionDelayMax: 30000, // Max 30 seconds between attempts
      randomizationFactor: 0.5, // Add some randomization to prevent thundering herd
      // Timeout settings for production
      timeout: 30000, // 30 seconds for initial connection
      // Force new connection
      forceNew: true,
      // Path must match server configuration
      path: '/socket.io/',
    });

    newSocket.on("connect", () => {
      console.log("Socket.io connected successfully! Transport:", newSocket.io.engine.transport.name);
      setIsConnected(true);
      setConnectionError(null);
      // Get current userId and request accounts
      const currentUserId = getCurrentUserId();
      setUserId(currentUserId);
      // Request accounts filtered by userId
      newSocket.emit("getAccounts", { userId: currentUserId });
    });

    newSocket.on("disconnect", (reason) => {
      console.log("Socket.io disconnected. Reason:", reason);
      setIsConnected(false);
      if (reason === "io server disconnect") {
        // Server disconnected, try to reconnect manually
        newSocket.connect();
      }
      setConnectionError("انقطع الاتصال بالخادم. جاري إعادة المحاولة...");
    });

    newSocket.on("connect_error", (error) => {
      console.error("Socket connection error:", error.message);
      setConnectionError(
        `فشل الاتصال: ${error.message}. جاري إعادة المحاولة...`
      );
      setIsConnected(false);
    });

    newSocket.io.on("reconnect_attempt", (attempt) => {
      console.log(`Reconnection attempt ${attempt}...`);
      setConnectionError(`جاري إعادة الاتصال... (المحاولة ${attempt})`);
    });

    newSocket.io.on("reconnect", (attempt) => {
      console.log(`Reconnected after ${attempt} attempts`);
      setConnectionError(null);
    });

    newSocket.io.on("reconnect_failed", () => {
      console.error("Reconnection failed after all attempts");
      setConnectionError("فشل إعادة الاتصال. يرجى تحديث الصفحة.");
    });

    newSocket.on("status", (data: { isReady: boolean }) => {
      setIsReady(data.isReady);
      if (data.isReady) {
        setQrCode(null);
      }
    });

    newSocket.on("qr", (qr: string) => {
      setQrCode(qr);
      setIsReady(false);
    });

    newSocket.on("ready", () => {
      setIsReady(true);
      setQrCode(null);
      setIsLoading(true);
      setConnectionHealth({ status: 'healthy', message: 'متصل', canReconnect: false });
      // Start heartbeat for connection monitoring
      newSocket.emit("startHeartbeat");
      // بدء المزامنة التلقائية بعد الاتصال
      setTimeout(() => {
        console.log("Starting automatic sync after ready...");
        newSocket.emit("syncAllChats", {}); // No limit - load all chats
      }, 2000);
    });

    // Connection health monitoring from server heartbeat
    newSocket.on("connectionHealth", (data: {
      status: 'healthy' | 'degraded' | 'error';
      message: string;
      canReconnect: boolean;
    }) => {
      setConnectionHealth(data);
      if (data.status === 'error' || data.status === 'degraded') {
        setConnectionError(data.message);
      } else {
        setConnectionError(null);
      }
    });

    // Handle reconnection events from server
    newSocket.on("reconnecting", (data: { attempt: number; manual?: boolean }) => {
      console.log(`Server reconnecting, attempt ${data.attempt}`);
      setConnectionError(`جاري إعادة الاتصال... (المحاولة ${data.attempt})`);
      setConnectionHealth({ status: 'degraded', message: 'جاري إعادة الاتصال', canReconnect: false });
    });

    // Handle reconnection failure from server
    newSocket.on("reconnectFailed", (data: { reason: string; canManualRetry: boolean }) => {
      console.error("Server reconnect failed:", data.reason);
      setConnectionError(`فشل إعادة الاتصال: ${data.reason}`);
      setConnectionHealth({
        status: 'error',
        message: data.reason,
        canReconnect: data.canManualRetry
      });
    });

    // ==================== Multi-Device Phone State Tracking ====================
    // This tracks whether the phone is online/offline - with Multi-Device, app continues to work
    newSocket.on("phoneState", (data: PhoneState) => {
      console.log("Phone state changed:", data);
      setPhoneState(data);
      setMultiDeviceEnabled(data.multiDeviceActive);

      // Show info message but don't treat as error - Multi-Device keeps working
      if (!data.isPhoneOnline && data.multiDeviceActive) {
        console.log("Phone offline but Multi-Device active - continuing normally");
      }
    });

    newSocket.on("chats", (data: Chat[]) => {
      // Ensure data is always an array
      setChats(Array.isArray(data) ? data : []);
      // لا نوقف التحميل هنا - سيتم التحكم به من syncProgress
    });

    newSocket.on("chatsError", () => {
      setIsLoading(false);
      setSyncProgress(defaultSyncProgress);
    });

    // ==================== Real-time Unread Count Updates ====================
    // Update unread counts when messages are read from phone
    newSocket.on("unreadCountUpdate", (updates: { chatId: string; unreadCount: number; timestamp: number }[]) => {
      console.log("Unread count updates received:", updates.length);

      setChats(prevChats => {
        const newChats = [...prevChats];
        let hasChanges = false;

        for (const update of updates) {
          const chatIndex = newChats.findIndex(c => c.id === update.chatId);
          if (chatIndex !== -1 && newChats[chatIndex].unreadCount !== update.unreadCount) {
            newChats[chatIndex] = {
              ...newChats[chatIndex],
              unreadCount: update.unreadCount
            };
            hasChanges = true;
            console.log(`Updated unread count for ${newChats[chatIndex].name}: ${update.unreadCount}`);
          }
        }

        return hasChanges ? newChats : prevChats;
      });
    });

    // Track when messages are read by recipients
    newSocket.on("messageRead", (data: { chatId: string; messageId: string; timestamp: number }) => {
      console.log("Message read:", data.chatId);
      // Can be used to update message status (double blue tick)
    });

    // Track when messages are deleted
    newSocket.on("messageRevoked", (data: { chatId: string; messageId: string; timestamp: number }) => {
      console.log("Message revoked:", data.chatId);
      // Can be used to update UI when message is deleted
    });

    // Handle chat updates (for real-time lastMessage updates)
    newSocket.on("chatUpdate", (data: { chatId: string; lastMessage: Chat["lastMessage"]; timestamp: number }) => {
      console.log("Chat update received:", data.chatId);
      setChats(prevChats => {
        const chatIndex = prevChats.findIndex(c => c.id === data.chatId);
        if (chatIndex === -1) return prevChats;

        const newChats = [...prevChats];
        newChats[chatIndex] = {
          ...newChats[chatIndex],
          lastMessage: data.lastMessage,
          timestamp: data.timestamp
        };

        // Re-sort by timestamp
        newChats.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        return newChats;
      });
    });

    // Sync progress handler
    newSocket.on("syncProgress", (data: SyncProgress) => {
      console.log("Sync progress:", data.status, data.progress + "%", data.chatName || "");
      setSyncProgress(data);

      if (data.status === "started" || data.status === "fetching" || data.status === "processing") {
        setIsLoading(true);
      } else if (data.status === "completed" || data.status === "quick") {
        // عند اكتمال المزامنة، نوقف التحميل بعد ثانية
        setTimeout(() => {
          setIsLoading(false);
          // إخفاء رسالة الإكمال بعد 5 ثوان
          setTimeout(() => {
            setSyncProgress(defaultSyncProgress);
          }, 5000);
        }, 1000);
      } else if (data.status === "error" || data.status === "cancelled") {
        setIsLoading(false);
        setTimeout(() => {
          setSyncProgress(defaultSyncProgress);
        }, 5000);
      }
    });

    // Streaming sync - receive individual chats in real-time
    newSocket.on("syncChat", (data: { chat: Chat; index: number; total: number }) => {
      // Add or update the chat immediately as it arrives
      setChats(prev => {
        const existingIndex = prev.findIndex(c => c.id === data.chat.id);
        if (existingIndex >= 0) {
          // Update existing chat
          const updated = [...prev];
          updated[existingIndex] = data.chat;
          return updated;
        } else {
          // Add new chat and keep sorted by timestamp
          return [...prev, data.chat].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        }
      });
    });

    // Clear chats before fresh sync
    newSocket.on("syncClear", () => {
      console.log("Clearing chats for fresh sync");
      setChats([]);
    });

    // Sync complete with stats
    newSocket.on("syncComplete", (data: { total: number; success: number; errors: number }) => {
      console.log(`Sync complete: ${data.success} success, ${data.errors} errors out of ${data.total}`);
    });

    // Quick sync data - update timestamps and unread counts for ALL chats
    newSocket.on("quickSyncData", (updates: Array<{ id: string; name?: string; unreadCount: number; timestamp: number; lastMessageBody: string | null; lastMessageFromMe: boolean; lastMessageType?: string }>) => {
      // Ensure updates is an array
      if (!Array.isArray(updates)) return;

      setChats(prev => {
        const updated = [...prev];
        const existingIds = new Set(prev.map(c => c.id));

        for (const update of updates) {
          const index = updated.findIndex(c => c.id === update.id);
          if (index >= 0) {
            // Update existing chat
            updated[index] = {
              ...updated[index],
              unreadCount: update.unreadCount,
              timestamp: update.timestamp,
              lastMessage: {
                body: update.lastMessageBody || updated[index].lastMessage?.body || "",
                fromMe: update.lastMessageFromMe,
                timestamp: update.timestamp,
                type: update.lastMessageType || updated[index].lastMessage?.type || "chat",
                typeLabel: updated[index].lastMessage?.typeLabel || "نص",
                senderName: updated[index].lastMessage?.senderName || "",
              },
            };
          } else if (update.name) {
            // Add new chat if not exists and has name
            const phoneNumber = update.id.replace("@c.us", "").replace("@g.us", "");
            updated.push({
              id: update.id,
              name: update.name,
              phone: phoneNumber,
              profilePic: null,
              isGroup: update.id.includes("@g.us"),
              participants: [],
              participantCount: 0,
              unreadCount: update.unreadCount,
              lastMessage: update.lastMessageBody ? {
                body: update.lastMessageBody,
                fromMe: update.lastMessageFromMe,
                timestamp: update.timestamp,
                type: update.lastMessageType || "chat",
                typeLabel: "نص",
                senderName: "",
              } : null,
              timestamp: update.timestamp,
            });
          }
        }
        return updated.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
      });
    });

    // Handle profile picture updates
    newSocket.on("profilePic", (data: { chatId: string; url: string | null }) => {
      setChats(prev => prev.map(chat =>
        chat.id === data.chatId ? { ...chat, profilePic: data.url } : chat
      ));
    });

    // Handle batch profile picture updates
    newSocket.on("profilePics", (data: Record<string, string | null>) => {
      setChats(prev => prev.map(chat =>
        data[chat.id] !== undefined ? { ...chat, profilePic: data[chat.id] } : chat
      ));
    });

    // Search progress handler
    newSocket.on("searchProgress", (data: { status: string; message: string; progress: number }) => {
      setSearchState(prev => ({
        ...prev,
        status: data.status as SearchState["status"],
        message: data.message,
        progress: data.progress,
      }));
    });

    // Search results handler
    newSocket.on("searchResults", (data: { results: SearchResult[]; query: string }) => {
      setSearchState(prev => ({
        ...prev,
        status: "completed",
        results: data.results,
        query: data.query,
      }));
    });

    // Search error handler
    newSocket.on("searchError", () => {
      setSearchState(prev => ({
        ...prev,
        status: "error",
      }));
    });

    newSocket.on("messages", (data: { chatId: string; messages: Message[] }) => {
      setMessages((prev) => ({ ...prev, [data.chatId]: data.messages }));
    });

    newSocket.on("newMessage", (message: Message & { from: string; chatId: string; senderName: string; type: string; typeLabel: string; chatName?: string; isGroup?: boolean }) => {
      console.log("New message received:", message.body?.substring(0, 30));

      setMessages((prev) => {
        const chatId = message.chatId || message.from;
        const chatMessages = prev[chatId] || [];
        const exists = chatMessages.some(m => m.id === message.id);
        if (exists) return prev;
        return { ...prev, [chatId]: [...chatMessages, message] };
      });

      setChats((prevChats) => {
        const chatId = message.chatId || message.from;
        const chatIndex = prevChats.findIndex(c => c.id === chatId);

        if (chatIndex === -1) {
          // إذا لم تكن المحادثة موجودة، نضيفها كمحادثة جديدة
          // هذا مهم خاصة أثناء المزامنة
          const phoneNumber = chatId.replace("@c.us", "").replace("@g.us", "");
          const newChat: Chat = {
            id: chatId,
            name: message.chatName || message.senderName || phoneNumber,
            phone: phoneNumber,
            profilePic: null,
            isGroup: message.isGroup || chatId.includes("@g.us"),
            participants: [],
            participantCount: 0,
            unreadCount: message.fromMe ? 0 : 1,
            lastMessage: {
              body: message.body,
              fromMe: message.fromMe,
              timestamp: message.timestamp,
              type: message.type || "chat",
              typeLabel: message.typeLabel || "نص",
              senderName: message.senderName || "",
            },
            timestamp: message.timestamp,
          };

          // أضف المحادثة الجديدة وارتبها
          const updatedChats = [...prevChats, newChat].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

          // لا نطلب getChats هنا - لدينا المعلومات الكافية
          // هذا يمنع الطلبات المتكررة

          return updatedChats;
        }

        const updatedChats = [...prevChats];
        const chat = { ...updatedChats[chatIndex] };

        chat.lastMessage = {
          body: message.body,
          fromMe: message.fromMe,
          timestamp: message.timestamp,
          type: message.type || "chat",
          typeLabel: message.typeLabel || "نص",
          senderName: message.senderName || "",
        };
        chat.timestamp = message.timestamp;

        if (!message.fromMe) {
          chat.unreadCount = (chat.unreadCount || 0) + 1;
        }

        updatedChats[chatIndex] = chat;
        updatedChats.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

        return updatedChats;
      });
    });

    newSocket.on("logout", () => {
      console.log("Logout event received, clearing all data...");
      setIsReady(false);
      setChats([]);
      setMessages({});
      setQrCode(null);
      setIsLoading(false);
      setSyncProgress(defaultSyncProgress);
      setSearchState(defaultSearchState);
    });

    // Account management events
    newSocket.on("accounts", (data: Account[]) => {
      // Ensure data is always an array
      setAccounts(Array.isArray(data) ? data : []);
    });

    newSocket.on("currentAccount", (accountId: string | null) => {
      setCurrentAccountId(accountId);
    });

    newSocket.on("accountsUpdated", (data: Account[]) => {
      setAccounts(data);
    });

    newSocket.on("accountAdded", (account: Account) => {
      setAccounts(prev => [...prev, account]);
    });

    newSocket.on("qrCleared", () => {
      console.log("QR cleared, waiting for new QR...");
      setQrCode(null);
      setIsReady(false);
    });

    newSocket.on("sessionsCleared", (data: { success: boolean; error?: string }) => {
      if (data.success) {
        console.log("Sessions cleared successfully");
        setQrCode(null);
        setIsReady(false);
        setChats([]);
        setMessages({});
      } else {
        console.error("Failed to clear sessions:", data.error);
      }
    });

    setSocket(newSocket);

    return () => {
      newSocket.close();
    };
  }, []);

  const fetchChats = useCallback(() => {
    if (socket && isReady) {
      setIsLoading(true);
      socket.emit("getChats");
    }
  }, [socket, isReady]);

  // Sync all chats without any limit
  const syncAllChats = useCallback(() => {
    if (socket && isReady) {
      setIsLoading(true);
      setSyncProgress({
        status: "started",
        message: "جاري بدء المزامنة...",
        progress: 0,
        total: 0,
        current: 0,
      });
      socket.emit("syncAllChats", {}); // No maxChats limit
    }
  }, [socket, isReady]);

  // Quick sync - fast update of timestamps and unread counts
  const quickSync = useCallback(() => {
    if (socket && isReady) {
      socket.emit("quickSync");
    }
  }, [socket, isReady]);

  // Fetch profile pictures for visible chats (lazy loading)
  const fetchProfilePics = useCallback((chatIds: string[]) => {
    if (socket && isReady && chatIds.length > 0) {
      // Just emit the request - server will handle filtering
      socket.emit("getProfilePics", { chatIds });
    }
  }, [socket, isReady]);

  const searchMessages = useCallback((query: string) => {
    if (socket && isReady && query.trim().length >= 2) {
      setSearchState({
        status: "searching",
        message: `جاري البحث عن "${query}"...`,
        progress: 0,
        results: [],
        query: query,
      });
      socket.emit("searchMessages", { query, maxChats: 100, maxMessagesPerChat: 50 });
    }
  }, [socket, isReady]);

  const clearSearch = useCallback(() => {
    setSearchState(defaultSearchState);
  }, []);

  const fetchMessages = useCallback((chatId: string) => {
    socket?.emit("getMessages", { chatId });
  }, [socket]);

  const sendMessage = useCallback((chatId: string, message: string) => {
    if (socket && isReady && message.trim()) {
      socket.emit("sendMessage", { chatId, message: message.trim() });
    }
  }, [socket, isReady]);

  const logout = useCallback(() => {
    if (socket) {
      console.log("Logging out...");
      socket.emit("logout");
      // مسح البيانات فوراً في الواجهة
      setIsReady(false);
      setChats([]);
      setMessages({});
      setQrCode(null);
      setIsLoading(false);
      setSyncProgress(defaultSyncProgress);
      setSearchState(defaultSearchState);
    }
  }, [socket]);

  const addAccount = useCallback((name: string) => {
    if (socket) {
      const currentUserId = getCurrentUserId();
      socket.emit("addAccount", { name, userId: currentUserId });
    }
  }, [socket]);

  const switchAccount = useCallback((accountId: string) => {
    if (socket) {
      console.log("Switching to account:", accountId);
      socket.emit("switchAccount", { accountId });
      // Clear data immediately
      setIsReady(false);
      setChats([]);
      setMessages({});
      setQrCode(null);
      setIsLoading(false);
      setSyncProgress(defaultSyncProgress);
      setSearchState(defaultSearchState);
    }
  }, [socket]);

  const deleteAccount = useCallback((accountId: string) => {
    if (socket) {
      socket.emit("deleteAccount", { accountId });
    }
  }, [socket]);

  const clearSessions = useCallback(() => {
    if (socket) {
      console.log("Clearing sessions...");
      socket.emit("clearSessions");
      // Clear local state immediately
      setQrCode(null);
      setIsReady(false);
      setChats([]);
      setMessages({});
    }
  }, [socket]);

  // Request manual reconnection from server
  const requestReconnect = useCallback(() => {
    if (socket) {
      console.log("Requesting manual reconnection...");
      setConnectionError("جاري إعادة الاتصال...");
      setConnectionHealth({ status: 'degraded', message: 'جاري إعادة الاتصال', canReconnect: false });
      socket.emit("requestReconnect");
    }
  }, [socket]);

  return (
    <SocketContext.Provider
      value={{
        socket,
        isConnected,
        isReady,
        isLoading,
        qrCode,
        chats,
        messages,
        syncProgress,
        searchState,
        privacyMode,
        accounts,
        currentAccountId,
        connectionError,
        connectionHealth,
        phoneState,
        multiDeviceEnabled,
        setPrivacyMode,
        fetchChats,
        fetchMessages,
        syncAllChats,
        quickSync,
        fetchProfilePics,
        searchMessages,
        sendMessage,
        clearSearch,
        logout,
        addAccount,
        switchAccount,
        deleteAccount,
        clearSessions,
        requestReconnect,
      }}
    >
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error("useSocket must be used within a SocketProvider");
  }
  return context;
}
