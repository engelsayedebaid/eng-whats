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
  setPrivacyMode: (value: boolean) => void;
  fetchChats: () => void;
  fetchMessages: (chatId: string) => void;
  syncAllChats: (maxChats?: number) => void;
  searchMessages: (query: string) => void;
  sendMessage: (chatId: string, message: string) => void;
  clearSearch: () => void;
  logout: () => void;
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

  useEffect(() => {
    const newSocket = io();

    newSocket.on("connect", () => {
      setIsConnected(true);
    });

    newSocket.on("disconnect", () => {
      setIsConnected(false);
    });

    newSocket.on("status", (data: { isReady: boolean }) => {
      setIsReady(data.isReady);
      if (data.isReady) {
        setQrCode(null);
        setIsLoading(true);
        setTimeout(() => newSocket.emit("getChats"), 3000);
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
      setTimeout(() => newSocket.emit("getChats"), 3000);
    });

    newSocket.on("chats", (data: Chat[]) => {
      setChats(data);
      setIsLoading(false);
    });

    newSocket.on("chatsError", () => {
      setIsLoading(false);
      setSyncProgress(defaultSyncProgress);
    });

    // Sync progress handler
    newSocket.on("syncProgress", (data: SyncProgress) => {
      setSyncProgress(data);

      if (data.status === "started" || data.status === "processing") {
        setIsLoading(true);
      } else if (data.status === "completed" || data.status === "error") {
        if (data.status === "error") {
          setIsLoading(false);
        }
        setTimeout(() => {
          setSyncProgress(defaultSyncProgress);
        }, 3000);
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
      setIsReady(false);
      setChats([]);
      setMessages({});
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
    socket?.emit("logout");
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
        setPrivacyMode,
        fetchChats,
        fetchMessages,
        syncAllChats,
        searchMessages,
        sendMessage,
        clearSearch,
        logout,
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
