"use client";

import { useState, useEffect, useMemo } from "react";
import { useSocket } from "@/context/SocketContext";
import {
  Search, Filter, MessageCircle, CheckCheck, Clock, RefreshCw, Loader2, Users,
  Calendar, CalendarDays, CalendarRange, Image as ImageIcon, Video, Mic, FileText,
  MapPin, User, Sticker, BarChart2, ChevronDown, X, Archive, ArchiveRestore, Pin, PinOff,
  Eye, EyeOff, UserPlus, Sparkles
} from "lucide-react";
import Image from "next/image";

type FilterType = "all" | "replied" | "not_replied";
type DateFilterType = "all" | "today" | "week" | "month";
type TypeFilterType = "all" | "text" | "media" | "voice" | "document";
type ChatTypeFilter = "all" | "private" | "groups";

// LTR Text Component for proper number display
function LTRText({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      style={{
        direction: 'ltr',
        unicodeBidi: 'embed',
        display: 'inline-block'
      }}
      className={className}
    >
      {children}
    </span>
  );
}

// Privacy Text Component - blurs text and reveals on hover
function PrivacyText({ children, isBlurred, className = "" }: { children: React.ReactNode; isBlurred: boolean; className?: string }) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <span
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        filter: isBlurred && !isHovered ? 'blur(5px)' : 'none',
        transition: 'filter 0.2s ease',
        cursor: isBlurred ? 'pointer' : 'default',
        direction: 'ltr',
        unicodeBidi: 'embed',
        display: 'inline-block'
      }}
      className={className}
    >
      {children}
    </span>
  );
}

// Filter Button Component
function FilterButton({
  active,
  onClick,
  icon,
  label,
  count,
  color = "green"
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  count?: number;
  color?: "green" | "blue" | "purple" | "orange";
}) {
  const colors = {
    green: {
      active: "bg-gradient-to-r from-green-600 to-emerald-500 text-white shadow-lg shadow-green-500/25",
      inactive: "bg-[#202c33] text-gray-300 hover:bg-[#2a3942] hover:text-white"
    },
    blue: {
      active: "bg-gradient-to-r from-blue-600 to-cyan-500 text-white shadow-lg shadow-blue-500/25",
      inactive: "bg-[#202c33] text-gray-300 hover:bg-[#2a3942] hover:text-white"
    },
    purple: {
      active: "bg-gradient-to-r from-purple-600 to-pink-500 text-white shadow-lg shadow-purple-500/25",
      inactive: "bg-[#202c33] text-gray-300 hover:bg-[#2a3942] hover:text-white"
    },
    orange: {
      active: "bg-gradient-to-r from-orange-600 to-amber-500 text-white shadow-lg shadow-orange-500/25",
      inactive: "bg-[#202c33] text-gray-300 hover:bg-[#2a3942] hover:text-white"
    }
  };

  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200 ${active ? colors[color].active : colors[color].inactive
        }`}
    >
      {icon}
      <span>{label}</span>
      {count !== undefined && (
        <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${active ? "bg-white/20" : "bg-gray-600"
          }`}>
          {count}
        </span>
      )}
    </button>
  );
}

// Filter Section Component
function FilterSection({
  title,
  icon,
  children,
  isOpen,
  onToggle,
  activeCount
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  isOpen: boolean;
  onToggle: () => void;
  activeCount?: number;
}) {
  return (
    <div className="border border-gray-700/50 rounded-xl overflow-hidden bg-gradient-to-b from-[#1a2730] to-[#111b21]">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-3 hover:bg-[#1a2730] transition-colors"
      >
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-green-500/20 to-teal-500/20 flex items-center justify-center text-green-400">
            {icon}
          </div>
          <span className="text-sm font-medium text-white">{title}</span>
          {activeCount && activeCount > 0 && (
            <span className="px-2 py-0.5 bg-green-500/20 text-green-400 rounded-full text-xs">
              {activeCount} نشط
            </span>
          )}
        </div>
        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
      </button>
      {isOpen && (
        <div className="p-3 pt-0 border-t border-gray-700/30">
          <div className="flex flex-wrap gap-2 pt-3">
            {children}
          </div>
        </div>
      )}
    </div>
  );
}

export default function ChatList({
  onSelectChat,
  selectedChatId,
}: {
  onSelectChat: (chatId: string) => void;
  selectedChatId: string | null;
}) {
  const { chats, messages, isLoading, syncAllChats, fetchChats, isReady, syncProgress, searchMessages, clearSearch, searchState, privacyMode, setPrivacyMode } = useSocket();
  const [filter, setFilter] = useState<FilterType>("all");
  const [dateFilter, setDateFilter] = useState<DateFilterType>("all");
  const [typeFilter, setTypeFilter] = useState<TypeFilterType>("all");
  const [chatTypeFilter, setChatTypeFilter] = useState<ChatTypeFilter>("all");
  const [showNewContactsOnly, setShowNewContactsOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [openSections, setOpenSections] = useState({
    date: true,
    status: true,
    type: false,
    chatType: true
  });
  const [archivedChats, setArchivedChats] = useState<string[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [pinnedChats, setPinnedChats] = useState<string[]>([]);

  // Load archived and pinned chats from localStorage
  useEffect(() => {
    const savedArchived = localStorage.getItem('archivedChats');
    if (savedArchived) {
      setArchivedChats(JSON.parse(savedArchived));
    }
    const savedPinned = localStorage.getItem('pinnedChats');
    if (savedPinned) {
      setPinnedChats(JSON.parse(savedPinned));
    }
  }, []);

  // Toggle archive status
  const toggleArchive = (chatId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setArchivedChats(prev => {
      const newArchived = prev.includes(chatId)
        ? prev.filter(id => id !== chatId)
        : [...prev, chatId];
      localStorage.setItem('archivedChats', JSON.stringify(newArchived));
      return newArchived;
    });
  };

  // Toggle pin status
  const togglePin = (chatId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setPinnedChats(prev => {
      const newPinned = prev.includes(chatId)
        ? prev.filter(id => id !== chatId)
        : [...prev, chatId];
      localStorage.setItem('pinnedChats', JSON.stringify(newPinned));
      return newPinned;
    });
  };

  // Auto-fetch on ready
  useEffect(() => {
    if (isReady && chats.length === 0) {
      fetchChats();
    }
  }, [isReady, chats.length, fetchChats]);

  // Date filter helpers
  const getDateRange = (filter: DateFilterType) => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    switch (filter) {
      case "today":
        return today.getTime() / 1000;
      case "week":
        const weekAgo = new Date(today);
        weekAgo.setDate(weekAgo.getDate() - 7);
        return weekAgo.getTime() / 1000;
      case "month":
        const monthAgo = new Date(today);
        monthAgo.setMonth(monthAgo.getMonth() - 1);
        return monthAgo.getTime() / 1000;
      default:
        return 0;
    }
  };

  // Message type filter
  const matchesTypeFilter = (chat: typeof chats[0]) => {
    if (typeFilter === "all") return true;
    const type = chat.lastMessage?.type || "chat";

    switch (typeFilter) {
      case "text":
        return type === "chat";
      case "media":
        return ["image", "video", "sticker"].includes(type);
      case "voice":
        return ["audio", "ptt"].includes(type);
      case "document":
        return type === "document";
      default:
        return true;
    }
  };

  const filteredChats = useMemo(() => {
    const minTimestamp = getDateRange(dateFilter);

    // Get today's start timestamp for new contacts filter
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStartTimestamp = today.getTime() / 1000;

    return chats
      .filter((chat) => {
        // Archive filter
        const isArchived = archivedChats.includes(chat.id);
        if (showArchived && !isArchived) return false;
        if (!showArchived && isArchived) return false;

        // Search filter (search by name, phone, or message content)
        if (searchQuery) {
          const query = searchQuery.toLowerCase();
          const matchesName = chat.name?.toLowerCase().includes(query);
          const matchesPhone = chat.phone?.includes(searchQuery);
          const matchesMessage = chat.lastMessage?.body?.toLowerCase().includes(query);
          if (!matchesName && !matchesPhone && !matchesMessage) return false;
        }

        // New contacts today filter - only show chats where ALL messages are from today
        if (showNewContactsOnly) {
          if (chat.isGroup) return false; // Exclude groups

          // Check if this chat has messages loaded
          const chatMessages = messages[chat.id];
          if (chatMessages && chatMessages.length > 0) {
            // Check if the oldest message is from today
            const oldestMessage = chatMessages.reduce((oldest, msg) =>
              msg.timestamp < oldest.timestamp ? msg : oldest
              , chatMessages[0]);
            if (oldestMessage.timestamp < todayStartTimestamp) return false;
          } else {
            // If no messages loaded, check the chat timestamp
            const chatTimestamp = chat.timestamp || 0;
            if (chatTimestamp < todayStartTimestamp) return false;
          }
        }

        // Date filter
        const chatTimestamp = chat.lastMessage?.timestamp || chat.timestamp || 0;
        if (dateFilter !== "all" && chatTimestamp < minTimestamp) {
          return false;
        }

        // Type filter
        if (!matchesTypeFilter(chat)) return false;

        // Chat type filter (private vs groups)
        if (chatTypeFilter === "private" && chat.isGroup) return false;
        if (chatTypeFilter === "groups" && !chat.isGroup) return false;

        // Status filter
        if (filter === "replied") {
          return chat.lastMessage?.fromMe === true;
        }
        if (filter === "not_replied") {
          return chat.lastMessage?.fromMe === false;
        }
        return true;
      })
      .sort((a, b) => {
        // Pinned chats first
        const aIsPinned = pinnedChats.includes(a.id);
        const bIsPinned = pinnedChats.includes(b.id);
        if (aIsPinned && !bIsPinned) return -1;
        if (!aIsPinned && bIsPinned) return 1;
        // Then sort by timestamp
        return (b.timestamp || 0) - (a.timestamp || 0);
      });
  }, [chats, searchQuery, dateFilter, typeFilter, filter, chatTypeFilter, showNewContactsOnly, archivedChats, showArchived, pinnedChats]);

  const formatTime = (timestamp: number) => {
    if (!timestamp) return "";
    const date = new Date(timestamp * 1000);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();

    if (isToday) {
      return date.toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" });
    }
    return date.toLocaleDateString("ar-EG", { day: "numeric", month: "short" });
  };

  const getFilterStats = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayTimestamp = today.getTime() / 1000;

    const replied = chats.filter((c) => c.lastMessage?.fromMe === true).length;
    const notReplied = chats.filter((c) => c.lastMessage?.fromMe === false).length;
    const privateChats = chats.filter((c) => !c.isGroup).length;
    const groupChats = chats.filter((c) => c.isGroup).length;

    // New contacts today: private chats where ALL messages are from today (no previous history)
    const newContactsToday = chats.filter((c) => {
      if (c.isGroup) return false; // Exclude groups

      // Check if this chat has messages loaded
      const chatMessages = messages[c.id];
      if (chatMessages && chatMessages.length > 0) {
        // Check if the oldest message is from today
        const oldestMessage = chatMessages.reduce((oldest, msg) =>
          msg.timestamp < oldest.timestamp ? msg : oldest
          , chatMessages[0]);
        return oldestMessage.timestamp >= todayTimestamp;
      }

      // If no messages loaded, check the chat timestamp
      const chatTimestamp = c.timestamp || 0;
      return chatTimestamp >= todayTimestamp;
    }).length;

    return { all: chats.length, replied, notReplied, privateChats, groupChats, newContactsToday };
  };

  const getMessageTypeIcon = (type: string) => {
    switch (type) {
      case "image": return <ImageIcon className="w-4 h-4 text-blue-400" />;
      case "video": return <Video className="w-4 h-4 text-purple-400" />;
      case "audio":
      case "ptt": return <Mic className="w-4 h-4 text-green-400" />;
      case "document": return <FileText className="w-4 h-4 text-orange-400" />;
      case "location": return <MapPin className="w-4 h-4 text-red-400" />;
      case "contact": return <User className="w-4 h-4 text-cyan-400" />;
      case "sticker": return <Sticker className="w-4 h-4 text-yellow-400" />;
      case "poll_creation": return <BarChart2 className="w-4 h-4 text-pink-400" />;
      default: return null;
    }
  };

  const stats = getFilterStats();

  // Count active filters
  const activeFilterCount = [
    dateFilter !== "all",
    filter !== "all",
    typeFilter !== "all",
    chatTypeFilter !== "all",
    showNewContactsOnly
  ].filter(Boolean).length;

  // Reset all filters
  const resetFilters = () => {
    setDateFilter("all");
    setFilter("all");
    setTypeFilter("all");
    setChatTypeFilter("all");
    setShowNewContactsOnly(false);
    setSearchQuery("");
  };

  const toggleSection = (section: keyof typeof openSections) => {
    setOpenSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  return (
    <div className="flex flex-col h-full bg-[#111b21]">
      {/* Header */}
      <div className="p-4 border-b border-gray-700">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-white">المحادثات</h2>
          <div className="flex gap-2">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`relative p-2 rounded-lg transition-all duration-200 ${showFilters
                ? "bg-gradient-to-r from-green-600 to-emerald-500 text-white shadow-lg shadow-green-500/25"
                : "bg-[#202c33] text-gray-300 hover:bg-[#2a3942]"
                }`}
              title="فلاتر متقدمة"
            >
              <Filter className="w-5 h-5" />
              {activeFilterCount > 0 && !showFilters && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full text-[10px] flex items-center justify-center text-white font-bold">
                  {activeFilterCount}
                </span>
              )}
            </button>
            <button
              onClick={() => setShowArchived(!showArchived)}
              className={`p-2 rounded-lg transition-colors relative ${showArchived
                ? 'bg-purple-600 text-white'
                : 'bg-[#202c33] hover:bg-[#2a3942] text-gray-300'
                }`}
              title={showArchived ? "عرض المحادثات" : "عرض المؤرشفة"}
            >
              {showArchived ? <ArchiveRestore className="w-5 h-5" /> : <Archive className="w-5 h-5" />}
              {archivedChats.length > 0 && !showArchived && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-purple-500 rounded-full text-[10px] flex items-center justify-center text-white font-bold">
                  {archivedChats.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setPrivacyMode(!privacyMode)}
              className={`p-2 rounded-lg transition-colors ${privacyMode
                ? 'bg-amber-600 text-white'
                : 'bg-[#202c33] hover:bg-[#2a3942] text-gray-300'
                }`}
              title={privacyMode ? "إلغاء وضع الخصوصية" : "وضع الخصوصية"}
            >
              {privacyMode ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
            <button
              onClick={fetchChats}
              disabled={isLoading}
              className="p-2 bg-[#202c33] hover:bg-[#2a3942] rounded-lg text-gray-300 transition-colors disabled:opacity-50"
              title="تحديث"
            >
              <RefreshCw className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={() => syncAllChats()}
              disabled={isLoading}
              className="flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-green-600 to-emerald-500 hover:from-green-700 hover:to-emerald-600 rounded-lg text-white text-sm transition-all duration-200 disabled:opacity-50 shadow-lg shadow-green-500/25"
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
              مزامنة
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="relative mb-4">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="بحث بالاسم، الرقم، أو المحتوى..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && searchQuery.trim().length >= 2) {
                searchMessages(searchQuery);
              }
            }}
            className="w-full bg-[#202c33] text-white placeholder-gray-400 pr-10 pl-20 py-2.5 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 transition-all duration-200"
          />
          <div className="absolute left-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
            {searchQuery && (
              <button
                onClick={() => {
                  setSearchQuery("");
                  clearSearch();
                }}
                className="p-1 text-gray-400 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            )}
            {searchQuery.trim().length >= 2 && searchState.status !== "searching" && (
              <button
                onClick={() => searchMessages(searchQuery)}
                className="p-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
                title="بحث في كل الرسائل"
              >
                <Search className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Filters Panel */}
        {showFilters && (
          <div className="space-y-3 mb-3 animate-in slide-in-from-top-2 duration-200">
            {/* Active Filters Summary */}
            {activeFilterCount > 0 && (
              <div className="flex items-center justify-between p-2 bg-green-500/10 rounded-lg border border-green-500/20">
                <span className="text-sm text-green-400">
                  {activeFilterCount} فلتر نشط
                </span>
                <button
                  onClick={resetFilters}
                  className="text-xs text-gray-400 hover:text-white flex items-center gap-1 transition-colors"
                >
                  <X className="w-3 h-3" />
                  إزالة الكل
                </button>
              </div>
            )}

            {/* Date Filters */}
            <FilterSection
              title="الفترة الزمنية"
              icon={<Calendar className="w-4 h-4" />}
              isOpen={openSections.date}
              onToggle={() => toggleSection("date")}
              activeCount={dateFilter !== "all" ? 1 : 0}
            >
              <FilterButton
                active={dateFilter === "all"}
                onClick={() => setDateFilter("all")}
                icon={<CalendarRange className="w-3.5 h-3.5" />}
                label="الكل"
                color="blue"
              />
              <FilterButton
                active={dateFilter === "today"}
                onClick={() => setDateFilter("today")}
                icon={<Calendar className="w-3.5 h-3.5" />}
                label="اليوم"
                color="blue"
              />
              <FilterButton
                active={dateFilter === "week"}
                onClick={() => setDateFilter("week")}
                icon={<CalendarDays className="w-3.5 h-3.5" />}
                label="هذا الأسبوع"
                color="blue"
              />
              <FilterButton
                active={dateFilter === "month"}
                onClick={() => setDateFilter("month")}
                icon={<CalendarDays className="w-3.5 h-3.5" />}
                label="هذا الشهر"
                color="blue"
              />
            </FilterSection>

            {/* Status Filters */}
            <FilterSection
              title="حالة الرد"
              icon={<MessageCircle className="w-4 h-4" />}
              isOpen={openSections.status}
              onToggle={() => toggleSection("status")}
              activeCount={filter !== "all" ? 1 : 0}
            >
              <FilterButton
                active={filter === "all"}
                onClick={() => setFilter("all")}
                icon={<MessageCircle className="w-3.5 h-3.5" />}
                label="الكل"
                count={stats.all}
                color="green"
              />
              <FilterButton
                active={filter === "replied"}
                onClick={() => setFilter("replied")}
                icon={<CheckCheck className="w-3.5 h-3.5" />}
                label="تم الرد"
                count={stats.replied}
                color="green"
              />
              <FilterButton
                active={filter === "not_replied"}
                onClick={() => setFilter("not_replied")}
                icon={<Clock className="w-3.5 h-3.5" />}
                label="بانتظار الرد"
                count={stats.notReplied}
                color="orange"
              />
            </FilterSection>

            {/* Type Filters */}
            <FilterSection
              title="نوع الرسالة"
              icon={<FileText className="w-4 h-4" />}
              isOpen={openSections.type}
              onToggle={() => toggleSection("type")}
              activeCount={typeFilter !== "all" ? 1 : 0}
            >
              <FilterButton
                active={typeFilter === "all"}
                onClick={() => setTypeFilter("all")}
                icon={<MessageCircle className="w-3.5 h-3.5" />}
                label="الكل"
                color="purple"
              />
              <FilterButton
                active={typeFilter === "text"}
                onClick={() => setTypeFilter("text")}
                icon={<MessageCircle className="w-3.5 h-3.5" />}
                label="نصية"
                color="purple"
              />
              <FilterButton
                active={typeFilter === "media"}
                onClick={() => setTypeFilter("media")}
                icon={<ImageIcon className="w-3.5 h-3.5" />}
                label="صور / فيديو"
                color="purple"
              />
              <FilterButton
                active={typeFilter === "voice"}
                onClick={() => setTypeFilter("voice")}
                icon={<Mic className="w-3.5 h-3.5" />}
                label="صوتية"
                color="purple"
              />
              <FilterButton
                active={typeFilter === "document"}
                onClick={() => setTypeFilter("document")}
                icon={<FileText className="w-3.5 h-3.5" />}
                label="مستندات"
                color="purple"
              />
            </FilterSection>

            {/* Chat Type Filters (Private vs Groups) */}
            <FilterSection
              title="نوع المحادثة"
              icon={<Users className="w-4 h-4" />}
              isOpen={openSections.chatType}
              onToggle={() => toggleSection("chatType")}
              activeCount={chatTypeFilter !== "all" ? 1 : 0}
            >
              <FilterButton
                active={chatTypeFilter === "all"}
                onClick={() => setChatTypeFilter("all")}
                icon={<MessageCircle className="w-3.5 h-3.5" />}
                label="الكل"
                count={stats.all}
                color="blue"
              />
              <FilterButton
                active={chatTypeFilter === "private"}
                onClick={() => setChatTypeFilter("private")}
                icon={<User className="w-3.5 h-3.5" />}
                label="محادثات خاصة"
                count={stats.privateChats}
                color="blue"
              />
              <FilterButton
                active={chatTypeFilter === "groups"}
                onClick={() => setChatTypeFilter("groups")}
                icon={<Users className="w-3.5 h-3.5" />}
                label="مجموعات"
                count={stats.groupChats}
                color="blue"
              />
            </FilterSection>
          </div>
        )}

        {/* Quick Filters (Always visible) */}
        {!showFilters && (
          <div className="flex gap-2 flex-wrap">
            <FilterButton
              active={filter === "all" && chatTypeFilter === "all" && !showNewContactsOnly}
              onClick={() => { setFilter("all"); setChatTypeFilter("all"); setShowNewContactsOnly(false); }}
              icon={<MessageCircle className="w-3.5 h-3.5" />}
              label="الكل"
              count={stats.all}
              color="green"
            />
            <FilterButton
              active={showNewContactsOnly}
              onClick={() => setShowNewContactsOnly(!showNewContactsOnly)}
              icon={<Sparkles className="w-3.5 h-3.5" />}
              label="جديد اليوم"
              count={stats.newContactsToday}
              color="purple"
            />
            <FilterButton
              active={chatTypeFilter === "private" && !showNewContactsOnly}
              onClick={() => { setChatTypeFilter(chatTypeFilter === "private" ? "all" : "private"); setShowNewContactsOnly(false); }}
              icon={<User className="w-3.5 h-3.5" />}
              label="خاصة"
              count={stats.privateChats}
              color="blue"
            />
            <FilterButton
              active={chatTypeFilter === "groups"}
              onClick={() => { setChatTypeFilter(chatTypeFilter === "groups" ? "all" : "groups"); setShowNewContactsOnly(false); }}
              icon={<Users className="w-3.5 h-3.5" />}
              label="مجموعات"
              count={stats.groupChats}
              color="blue"
            />
            <FilterButton
              active={filter === "not_replied"}
              onClick={() => setFilter(filter === "not_replied" ? "all" : "not_replied")}
              icon={<Clock className="w-3.5 h-3.5" />}
              label="بانتظار الرد"
              count={stats.notReplied}
              color="orange"
            />
          </div>
        )}

        {/* Results count */}
        <div className="flex items-center justify-between text-xs text-gray-500 mt-3 pt-3 border-t border-gray-700/30">
          <span>عرض {filteredChats.length} من {chats.length} محادثة</span>
          {activeFilterCount > 0 && (
            <button
              onClick={resetFilters}
              className="text-green-400 hover:text-green-300 transition-colors"
            >
              إزالة الفلاتر
            </button>
          )}
        </div>
      </div>

      {/* Sync Progress Bar */}
      {(syncProgress.status === "started" || syncProgress.status === "fetching" || syncProgress.status === "processing") && (
        <div className="p-4 bg-gradient-to-r from-[#1a2730] to-[#111b21] border-b border-gray-700/30">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-green-400" />
              <span className="text-sm text-white font-medium">
                {syncProgress.status === "fetching" ? "جاري جلب المحادثات..." : "جاري المزامنة..."}
              </span>
            </div>
            <div className="flex items-center gap-3">
              {chats.length > 0 && (
                <span className="text-xs text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-full ltr-num">
                  {chats.length} محادثة
                </span>
              )}
              <span className="text-sm text-green-400 font-bold ltr-num">{syncProgress.progress}%</span>
            </div>
          </div>
          <div className="relative h-2 bg-gray-700 rounded-full overflow-hidden">
            <div
              className="absolute h-full bg-gradient-to-r from-green-500 to-emerald-400 rounded-full transition-all duration-300 ease-out"
              style={{ width: `${syncProgress.progress}%` }}
            />
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent animate-shimmer" />
          </div>
          <div className="flex items-center justify-between mt-2 text-xs text-gray-400">
            <span className="truncate max-w-[60%]">{syncProgress.message}</span>
            {syncProgress.total > 0 && (
              <span className="ltr-num">{syncProgress.current}/{syncProgress.total}</span>
            )}
          </div>
        </div>
      )}

      {/* Sync Completed Message */}
      {syncProgress.status === "completed" && (
        <div className="p-3 bg-green-500/10 border-b border-green-500/20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-green-400">
              <CheckCheck className="w-4 h-4" />
              <span className="text-sm">{syncProgress.message}</span>
            </div>
            {syncProgress.errorCount !== undefined && syncProgress.errorCount > 0 && (
              <span className="text-xs text-orange-400 bg-orange-500/10 px-2 py-0.5 rounded-full">
                {syncProgress.errorCount} خطأ
              </span>
            )}
          </div>
        </div>
      )}

      {/* Sync Cancelled Message */}
      {syncProgress.status === "cancelled" && (
        <div className="p-3 bg-orange-500/10 border-b border-orange-500/20">
          <div className="flex items-center gap-2 text-orange-400">
            <Clock className="w-4 h-4" />
            <span className="text-sm">{syncProgress.message}</span>
          </div>
        </div>
      )}

      {/* Sync Error Message */}
      {syncProgress.status === "error" && (
        <div className="p-3 bg-red-500/10 border-b border-red-500/20">
          <div className="flex items-center gap-2 text-red-400">
            <Clock className="w-4 h-4" />
            <span className="text-sm">{syncProgress.message}</span>
          </div>
        </div>
      )}

      {/* Loading State */}
      {isLoading && chats.length === 0 && syncProgress.status === "idle" && (
        <div className="flex flex-col items-center justify-center flex-1 text-gray-400">
          <Loader2 className="w-12 h-12 animate-spin text-green-500 mb-4" />
          <p>جاري تحميل المحادثات...</p>
        </div>
      )}

      {/* Search Progress */}
      {searchState.status === "searching" && (
        <div className="p-4 bg-gradient-to-r from-blue-500/10 to-cyan-500/10 border-b border-blue-500/20">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
              <span className="text-sm text-white font-medium">بحث متقدم...</span>
            </div>
            <span className="text-sm text-blue-400 font-bold ltr-num">{searchState.progress}%</span>
          </div>
          <div className="relative h-2 bg-gray-700 rounded-full overflow-hidden">
            <div
              className="absolute h-full bg-gradient-to-r from-blue-500 to-cyan-400 rounded-full transition-all duration-300 ease-out"
              style={{ width: `${searchState.progress}%` }}
            />
          </div>
          <p className="text-xs text-gray-400 mt-2">{searchState.message}</p>
        </div>
      )}

      {/* Search Results */}
      {searchState.status === "completed" && searchState.results.length > 0 && (
        <div className="flex-1 overflow-y-auto">
          <div className="p-3 bg-blue-500/10 border-b border-blue-500/20 sticky top-0 z-10">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-blue-400">
                <Search className="w-4 h-4" />
                <span className="text-sm">
                  تم العثور على <span className="font-bold ltr-num">{searchState.results.length}</span> نتيجة لـ "{searchState.query}"
                </span>
              </div>
              <button
                onClick={clearSearch}
                className="text-xs text-gray-400 hover:text-white transition-colors"
              >
                إغلاق
              </button>
            </div>
          </div>

          {searchState.results.map((result) => (
            <div
              key={result.id}
              onClick={() => onSelectChat(result.chatId)}
              className="flex gap-3 p-3 hover:bg-[#202c33] cursor-pointer border-b border-gray-700/30 transition-colors"
            >
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-cyan-600 flex items-center justify-center text-white font-bold flex-shrink-0">
                {result.chatName?.charAt(0) || "?"}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <h3 className="font-medium text-white text-sm truncate">{result.chatName}</h3>
                  <span dir="ltr" className="text-xs text-gray-500">
                    {new Date(result.timestamp * 1000).toLocaleString("ar-EG", {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit"
                    })}
                  </span>
                </div>
                <p dir="ltr" className="text-xs text-gray-500 mb-1">+{result.chatPhone}</p>
                <div className="flex items-center gap-1">
                  {result.fromMe && <CheckCheck className="w-3 h-3 text-green-500 flex-shrink-0" />}
                  <p className="text-sm text-gray-300 line-clamp-2">
                    {!result.fromMe && result.isGroup && (
                      <span className="text-blue-400">{result.senderName}: </span>
                    )}
                    {result.body}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* No Search Results */}
      {searchState.status === "completed" && searchState.results.length === 0 && searchState.query && (
        <div className="flex flex-col items-center justify-center py-8 text-gray-400">
          <Search className="w-12 h-12 text-gray-500 mb-4" />
          <p className="text-lg font-medium mb-2">لا توجد نتائج</p>
          <p className="text-sm text-gray-500 text-center">
            لم يتم العثور على نتائج لـ "{searchState.query}"
          </p>
          <button
            onClick={clearSearch}
            className="mt-4 px-4 py-2 text-blue-400 hover:text-blue-300 transition-colors"
          >
            إغلاق البحث
          </button>
        </div>
      )}

      {/* Chat List - Only show when not in search mode */}
      {searchState.status !== "completed" && (
        <div className="flex-1 overflow-y-auto">
          {!isLoading && filteredChats.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-400 p-4">
              <div className="w-20 h-20 rounded-full bg-[#202c33] flex items-center justify-center mb-4">
                <Filter className="w-10 h-10 text-gray-500" />
              </div>
              <p className="text-lg font-medium mb-2">لا توجد محادثات</p>
              <p className="text-sm text-gray-500 text-center mb-4">
                {activeFilterCount > 0
                  ? "جرب تغيير الفلاتر للحصول على نتائج"
                  : "اضغط على زر المزامنة لتحميل المحادثات"
                }
              </p>
              {activeFilterCount > 0 ? (
                <button
                  onClick={resetFilters}
                  className="px-4 py-2 bg-[#202c33] hover:bg-[#2a3942] rounded-lg text-white text-sm transition-colors"
                >
                  إزالة الفلاتر
                </button>
              ) : (
                <button
                  onClick={() => syncAllChats()}
                  className="px-4 py-2 bg-gradient-to-r from-green-600 to-emerald-500 hover:from-green-700 hover:to-emerald-600 rounded-lg text-white text-sm transition-all duration-200 shadow-lg shadow-green-500/25"
                >
                  مزامنة المحادثات
                </button>
              )}
            </div>
          ) : (
            filteredChats.map((chat) => (
              <div
                key={chat.id}
                onClick={() => onSelectChat(chat.id)}
                className={`group flex items-center gap-3 p-3 cursor-pointer border-b border-gray-700/30 transition-all duration-200 ${selectedChatId === chat.id
                  ? "bg-gradient-to-r from-[#2a3942] to-[#1f2d34]"
                  : "hover:bg-[#202c33]"
                  }`}
              >
                {/* Avatar */}
                <div className="relative w-12 h-12 rounded-full overflow-hidden flex-shrink-0">
                  {chat.profilePic ? (
                    <Image
                      src={chat.profilePic}
                      alt={chat.name}
                      fill
                      className="object-cover"
                      unoptimized
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-green-500 to-teal-600 flex items-center justify-center text-white font-bold text-lg">
                      {chat.isGroup ? (
                        <Users className="w-6 h-6" />
                      ) : (
                        chat.name?.charAt(0) || "?"
                      )}
                    </div>
                  )}
                </div>

                {/* Chat Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {pinnedChats.includes(chat.id) && (
                        <Pin className="w-3 h-3 text-green-400 flex-shrink-0" />
                      )}
                      <h3 className="font-medium text-white truncate">
                        <PrivacyText isBlurred={privacyMode}>{chat.name}</PrivacyText>
                      </h3>
                      {chat.isGroup && chat.participantCount > 0 && (
                        <LTRText className="text-xs text-gray-500">({chat.participantCount})</LTRText>
                      )}
                    </div>
                    <LTRText className="text-xs text-gray-400">
                      {formatTime(chat.lastMessage?.timestamp || chat.timestamp)}
                    </LTRText>
                  </div>

                  {/* Phone Number */}
                  {!chat.isGroup && chat.phone && (
                    <PrivacyText isBlurred={privacyMode} className="text-xs text-gray-500">
                      +{chat.phone}
                    </PrivacyText>
                  )}

                  {/* Last Message with sender and type */}
                  <div className="flex items-center gap-1 mt-0.5">
                    {chat.lastMessage?.fromMe && (
                      <CheckCheck className="w-4 h-4 text-green-500 flex-shrink-0" />
                    )}
                    {chat.lastMessage && getMessageTypeIcon(chat.lastMessage.type)}
                    <PrivacyText isBlurred={privacyMode} className="text-sm text-gray-400 truncate">
                      {chat.isGroup && !chat.lastMessage?.fromMe && chat.lastMessage?.senderName && (
                        <span className="text-green-400">{chat.lastMessage.senderName}: </span>
                      )}
                      {chat.lastMessage?.body || chat.lastMessage?.typeLabel || "لا توجد رسائل"}
                    </PrivacyText>
                  </div>
                </div>

                {/* Actions: Pin & Archive Buttons + Unread Badge */}
                <div className="flex flex-col items-end gap-1">
                  {chat.unreadCount > 0 && (
                    <div className="bg-gradient-to-r from-green-500 to-emerald-500 text-white text-xs font-bold px-2 py-1 rounded-full ltr-num shadow-lg shadow-green-500/25">
                      {chat.unreadCount}
                    </div>
                  )}
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-all">
                    <button
                      onClick={(e) => togglePin(chat.id, e)}
                      className={`p-1.5 rounded-lg transition-all ${pinnedChats.includes(chat.id)
                        ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30'
                        : 'bg-gray-700/50 text-gray-400 hover:bg-gray-600/50 hover:text-white'
                        }`}
                      title={pinnedChats.includes(chat.id) ? "إلغاء التثبيت" : "تثبيت"}
                    >
                      {pinnedChats.includes(chat.id) ? (
                        <PinOff className="w-4 h-4" />
                      ) : (
                        <Pin className="w-4 h-4" />
                      )}
                    </button>
                    <button
                      onClick={(e) => toggleArchive(chat.id, e)}
                      className={`p-1.5 rounded-lg transition-all ${archivedChats.includes(chat.id)
                        ? 'bg-purple-500/20 text-purple-400 hover:bg-purple-500/30'
                        : 'bg-gray-700/50 text-gray-400 hover:bg-gray-600/50 hover:text-white'
                        }`}
                      title={archivedChats.includes(chat.id) ? "إلغاء الأرشفة" : "أرشفة"}
                    >
                      {archivedChats.includes(chat.id) ? (
                        <ArchiveRestore className="w-4 h-4" />
                      ) : (
                        <Archive className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
