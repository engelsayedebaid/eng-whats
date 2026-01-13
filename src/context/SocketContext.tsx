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
  status: "idle" | "started" | "processing" | "completed" | "error";
  message: string;
  progress: number;
  total: number;
  current: number;
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
  setPrivacyMode: (value: boolean) => void;
  fetchChats: () => void;
  fetchMessages: (chatId: string) => void;
  syncAllChats: (maxChats?: number) => void;
  searchMessages: (query: string) => void;
  sendMessage: (chatId: string, message: string) => void;
  clearSearch: () => void;
  logout: () => void;
  addAccount: (name: string) => void;
  switchAccount: (accountId: string) => void;
  deleteAccount: (accountId: string) => void;
  clearSessions: () => void;
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

  useEffect(() => {
    // Get backend URL from environment variable or default to current origin
    const backendUrl = process.env.NEXT_PUBLIC_SOCKET_URL || (typeof window !== 'undefined' ? window.location.origin : '');

    console.log("Connecting to Socket.io server at:", backendUrl);

    const newSocket = io(backendUrl, {
      // Start with polling then upgrade to websocket for better compatibility
      transports: ['polling', 'websocket'],
      // Allow transport upgrade
      upgrade: true,
      // Reconnection settings
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      // Timeout settings for production
      timeout: 20000,
      // Force new connection
      forceNew: true,
      // Path must match server configuration
      path: '/socket.io/',
    });

    newSocket.on("connect", () => {
      console.log("Socket.io connected successfully! Transport:", newSocket.io.engine.transport.name);
      setIsConnected(true);
      setConnectionError(null);
      // Request accounts on connect
      newSocket.emit("getAccounts");
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
        setIsLoading(true);
        // بدء المزامنة التلقائية بعد 2 ثانية من الاتصال
        setTimeout(() => {
          console.log("Starting automatic sync after ready...");
          newSocket.emit("syncAllChats", {});
        }, 2000);
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
      // بدء المزامنة التلقائية بعد 2 ثانية من ready
      setTimeout(() => {
        console.log("Starting automatic sync after ready event...");
        newSocket.emit("syncAllChats", {});
      }, 2000);
    });

    newSocket.on("chats", (data: Chat[]) => {
      setChats(data);
      // نوقف التحميل فقط إذا لم تكن المزامنة قيد التنفيذ
      // سيتم التحكم في isLoading من خلال syncProgress handler
    });

    newSocket.on("chatsError", () => {
      setIsLoading(false);
      setSyncProgress(defaultSyncProgress);
    });

    // Sync progress handler
    newSocket.on("syncProgress", (data: SyncProgress) => {
      console.log("Sync progress received:", data);
      setSyncProgress(data);

      if (data.status === "started" || data.status === "processing") {
        setIsLoading(true);
      } else if (data.status === "completed") {
        // عند اكتمال المزامنة، نوقف التحميل بعد ثانية
        setTimeout(() => {
          setIsLoading(false);
          // إخفاء رسالة الإكمال بعد 5 ثوان
          setTimeout(() => {
            setSyncProgress(defaultSyncProgress);
          }, 5000);
        }, 1000);
      } else if (data.status === "error") {
        setIsLoading(false);
        setTimeout(() => {
          setSyncProgress(defaultSyncProgress);
        }, 5000);
      }
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

    newSocket.on("newMessage", (message: Message & { from: string; chatId: string; senderName: string; type: string; typeLabel: string }) => {
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
          newSocket.emit("getChats");
          return prevChats;
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
      setAccounts(data);
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

  const syncAllChats = useCallback((maxChats: number = 500) => {
    if (socket && isReady) {
      setIsLoading(true);
      setSyncProgress({
        status: "started",
        message: "جاري بدء المزامنة...",
        progress: 0,
        total: 0,
        current: 0,
      });
      socket.emit("syncAllChats", { maxChats });
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
      socket.emit("addAccount", { name });
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
        setPrivacyMode,
        fetchChats,
        fetchMessages,
        syncAllChats,
        searchMessages,
        sendMessage,
        clearSearch,
        logout,
        addAccount,
        switchAccount,
        deleteAccount,
        clearSessions,
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
