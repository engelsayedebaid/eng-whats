"use client";

import { useEffect, useState, useRef } from "react";
import { useSocket } from "@/context/SocketContext";
import {
  Send, CheckCheck, Image as ImageIcon, Video, Mic, FileText,
  Play, Pause, Download, X, Volume2, ZoomIn, Loader2, ChevronDown, ChevronUp
} from "lucide-react";

// Expandable Text Component for large messages
function ExpandableText({ text, maxLength = 500 }: { text: string; maxLength?: number }) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!text || text.length <= maxLength) {
    return <p className="break-words whitespace-pre-wrap">{text}</p>;
  }

  return (
    <div>
      <p className="break-words whitespace-pre-wrap">
        {isExpanded ? text : text.substring(0, maxLength) + "..."}
      </p>
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-1 mt-2 text-xs text-green-400 hover:text-green-300 transition-colors"
      >
        {isExpanded ? (
          <>
            <ChevronUp className="w-3 h-3" />
            عرض أقل
          </>
        ) : (
          <>
            <ChevronDown className="w-3 h-3" />
            عرض المزيد ({text.length} حرف)
          </>
        )}
      </button>
    </div>
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
      }}
      className={className}
    >
      {children}
    </span>
  );
}

// Media Modal Component
function MediaModal({
  isOpen,
  onClose,
  mediaUrl,
  mimetype,
  type
}: {
  isOpen: boolean;
  onClose: () => void;
  mediaUrl: string;
  mimetype: string | null;
  type: string;
}) {
  if (!isOpen) return null;

  const isVideo = type === "video" || mimetype?.startsWith("video/");
  const isImage = type === "image" || type === "sticker" || mimetype?.startsWith("image/");

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm"
      onClick={onClose}
    >
      <button
        onClick={onClose}
        className="absolute top-4 right-4 p-2 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors"
      >
        <X className="w-6 h-6" />
      </button>

      <a
        href={mediaUrl}
        download
        onClick={(e) => e.stopPropagation()}
        className="absolute top-4 left-4 p-2 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors"
      >
        <Download className="w-6 h-6" />
      </a>

      <div
        className="max-w-[90vw] max-h-[90vh] flex items-center justify-center"
        onClick={(e) => e.stopPropagation()}
      >
        {isImage && (
          <img
            src={mediaUrl}
            alt="Media"
            className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl"
          />
        )}
        {isVideo && (
          <video
            src={mediaUrl}
            controls
            autoPlay
            className="max-w-full max-h-[90vh] rounded-lg shadow-2xl"
          />
        )}
      </div>
    </div>
  );
}

// Audio Player Component
function AudioPlayer({ src, duration }: { src: string; duration?: number | null }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(duration || 0);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
    const handleLoadedMetadata = () => setAudioDuration(audio.duration);
    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("ended", handleEnded);

    return () => {
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("ended", handleEnded);
    };
  }, []);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
    } else {
      audio.play();
    }
    setIsPlaying(!isPlaying);
  };

  const formatTime = (time: number) => {
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const progress = audioDuration > 0 ? (currentTime / audioDuration) * 100 : 0;

  return (
    <div className="flex items-center gap-3 min-w-[200px]">
      <audio ref={audioRef} src={src} preload="metadata" />

      <button
        onClick={togglePlay}
        className="flex-shrink-0 w-10 h-10 rounded-full bg-green-500 hover:bg-green-600 flex items-center justify-center text-white transition-colors"
      >
        {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
      </button>

      <div className="flex-1">
        <div className="relative h-1 bg-gray-600 rounded-full overflow-hidden">
          <div
            className="absolute h-full bg-green-400 rounded-full transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="flex justify-between text-[10px] text-gray-400 mt-1 ltr-num">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(audioDuration)}</span>
        </div>
      </div>

      <Volume2 className="w-4 h-4 text-gray-400 flex-shrink-0" />
    </div>
  );
}

// Message Type Icons
function getMessageTypeInfo(type: string) {
  switch (type) {
    case "image":
      return { icon: <ImageIcon className="w-4 h-4" />, label: "صورة" };
    case "video":
      return { icon: <Video className="w-4 h-4" />, label: "فيديو" };
    case "audio":
    case "ptt":
      return { icon: <Mic className="w-4 h-4" />, label: "تسجيل صوتي" };
    case "document":
      return { icon: <FileText className="w-4 h-4" />, label: "مستند" };
    case "sticker":
      return { icon: <ImageIcon className="w-4 h-4" />, label: "ملصق" };
    default:
      return null;
  }
}

export default function ChatWindow({ chatId }: { chatId: string | null }) {
  const { messages, fetchMessages, chats, privacyMode, sendMessage } = useSocket();
  const [modalMedia, setModalMedia] = useState<{
    url: string;
    mimetype: string | null;
    type: string;
  } | null>(null);
  const [messageInput, setMessageInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [loadingMedia, setLoadingMedia] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (chatId) {
      fetchMessages(chatId);
    }
  }, [chatId, fetchMessages]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, chatId]);

  if (!chatId) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-[#0b141a] text-gray-400">
        <div className="w-64 h-64 mb-4">
          <svg viewBox="0 0 303 172" className="w-full h-full opacity-20">
            <path
              fill="currentColor"
              d="M229.565 160.229c32.647-25.126 50.587-59.422 50.587-96.15C280.152 28.692 217.393 0 140.076 0 62.759 0 0 28.692 0 64.079c0 36.728 17.94 71.024 50.587 96.15l-9.426 10.37c-2.592 2.85-0.953 7.455 2.852 8.022l36.795 5.486c3.024 0.451 5.777-1.833 5.901-4.902l0.607-15.013c32.647 10.83 68.54 10.83 101.187 0l0.607 15.013c0.124 3.069 2.877 5.353 5.901 4.902l36.795-5.486c3.805-0.567 5.444-5.172 2.852-8.022l-9.093-10.37z"
            />
          </svg>
        </div>
        <p className="text-lg">اختر محادثة لعرض الرسائل</p>
      </div>
    );
  }

  const chatMessages = messages[chatId] || [];
  const chat = chats.find((c) => c.id === chatId);

  const formatTime = (timestamp: number) => {
    if (!timestamp) return "";
    const date = new Date(timestamp * 1000);
    return date.toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" });
  };

  const renderMessageContent = (msg: typeof chatMessages[0]) => {
    const typeInfo = getMessageTypeInfo(msg.type);
    const isImage = msg.type === "image" || msg.type === "sticker";
    const isVideo = msg.type === "video";
    const isAudio = msg.type === "audio" || msg.type === "ptt";
    const isDocument = msg.type === "document";

    // Render media content
    if (msg.hasMedia && msg.mediaUrl) {
      if (isImage) {
        return (
          <div className="relative group cursor-pointer" onClick={() => setModalMedia({ url: msg.mediaUrl!, mimetype: msg.mimetype ?? null, type: msg.type })}>
            <img
              src={msg.mediaUrl}
              alt="صورة"
              className="max-w-[280px] max-h-[300px] rounded-lg object-cover"
            />
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors rounded-lg flex items-center justify-center">
              <ZoomIn className="w-8 h-8 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
            {msg.body && <p className="mt-2 break-words whitespace-pre-wrap">{msg.body}</p>}
          </div>
        );
      }

      if (isVideo) {
        return (
          <div className="relative group cursor-pointer" onClick={() => setModalMedia({ url: msg.mediaUrl!, mimetype: msg.mimetype ?? null, type: msg.type })}>
            <div className="relative max-w-[280px] rounded-lg overflow-hidden bg-black/50">
              <video
                src={msg.mediaUrl}
                className="max-w-[280px] max-h-[300px] rounded-lg"
                preload="metadata"
              />
              <div className="absolute inset-0 flex items-center justify-center bg-black/30 hover:bg-black/50 transition-colors">
                <div className="w-14 h-14 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
                  <Play className="w-8 h-8 text-white ml-1" />
                </div>
              </div>
            </div>
            {msg.body && <p className="mt-2 break-words whitespace-pre-wrap">{msg.body}</p>}
          </div>
        );
      }

      if (isAudio) {
        return (
          <AudioPlayer src={msg.mediaUrl} duration={msg.duration} />
        );
      }

      if (isDocument) {
        return (
          <a
            href={msg.mediaUrl}
            download={msg.filename || "document"}
            className="flex items-center gap-3 p-3 bg-black/20 rounded-lg hover:bg-black/30 transition-colors"
          >
            <div className="w-10 h-10 rounded-lg bg-orange-500/20 flex items-center justify-center">
              <FileText className="w-5 h-5 text-orange-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{msg.filename || "مستند"}</p>
              <p className="text-xs text-gray-400">{msg.mimetype || "document"}</p>
            </div>
            <Download className="w-5 h-5 text-gray-400" />
          </a>
        );
      }
    }

    // Loading state for media
    if (msg.hasMedia && !msg.mediaUrl) {
      return (
        <div className="flex items-center gap-2 text-gray-400">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm">{typeInfo?.label || "جاري تحميل الوسائط..."}</span>
        </div>
      );
    }

    // Regular text message or media placeholder
    if (typeInfo && !msg.hasMedia) {
      return (
        <div className="flex items-center gap-2 text-gray-300">
          {typeInfo.icon}
          <span className="text-sm">{typeInfo.label}</span>
        </div>
      );
    }

    // Plain text - use ExpandableText for large messages
    return (
      <PrivacyText isBlurred={privacyMode}>
        <ExpandableText text={msg.body} maxLength={500} />
      </PrivacyText>
    );
  };

  return (
    <div className="flex-1 flex flex-col bg-[#0b141a]">
      {/* Media Modal */}
      {modalMedia && (
        <MediaModal
          isOpen={!!modalMedia}
          onClose={() => setModalMedia(null)}
          mediaUrl={modalMedia.url}
          mimetype={modalMedia.mimetype}
          type={modalMedia.type}
        />
      )}

      {/* Header */}
      <div className="flex items-center gap-3 p-4 bg-[#202c33] border-b border-gray-700">
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-green-500 to-teal-600 flex items-center justify-center text-white font-bold">
          {chat?.name?.charAt(0) || "?"}
        </div>
        <div>
          <h3 className="font-semibold text-white">
            <PrivacyText isBlurred={privacyMode}>{chat?.name || "محادثة"}</PrivacyText>
          </h3>
          <p className="text-xs text-gray-400">
            <PrivacyText isBlurred={privacyMode}>
              {chat?.isGroup ? `مجموعة (${chat?.participantCount || 0})` : chat?.phone ? `+${chat?.phone}` : "محادثة خاصة"}
            </PrivacyText>
          </p>
        </div>
      </div>

      {/* Messages */}
      <div
        className="flex-1 overflow-y-auto p-4 space-y-2"
        style={{
          backgroundImage: "url('/chat-bg.png')",
          backgroundSize: "cover",
        }}
      >
        {chatMessages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-500">
            <Loader2 className="w-6 h-6 animate-spin mr-2" />
            جاري تحميل الرسائل...
          </div>
        ) : (
          <>
            {(() => {
              // Helper function to get date label
              const getDateLabel = (timestamp: number): string => {
                const msgDate = new Date(timestamp * 1000);
                const today = new Date();
                const yesterday = new Date(today);
                yesterday.setDate(yesterday.getDate() - 1);

                const msgDateStr = msgDate.toDateString();
                const todayStr = today.toDateString();
                const yesterdayStr = yesterday.toDateString();

                if (msgDateStr === todayStr) {
                  return "اليوم";
                } else if (msgDateStr === yesterdayStr) {
                  return "أمس";
                } else {
                  return msgDate.toLocaleDateString("ar-EG", {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                    year: msgDate.getFullYear() !== today.getFullYear() ? "numeric" : undefined
                  });
                }
              };

              let lastDateLabel = "";

              return chatMessages.map((msg, index) => {
                const currentDateLabel = getDateLabel(msg.timestamp);
                const showDateSeparator = currentDateLabel !== lastDateLabel;
                lastDateLabel = currentDateLabel;

                return (
                  <div key={msg.id}>
                    {/* Date Separator */}
                    {showDateSeparator && (
                      <div className="flex items-center justify-center my-4">
                        <div className="bg-[#1d2b33] text-gray-300 text-xs px-3 py-1.5 rounded-lg shadow-md">
                          {currentDateLabel}
                        </div>
                      </div>
                    )}

                    {/* Message */}
                    <div className={`flex ${msg.fromMe ? "justify-end" : "justify-start"}`}>
                      <div
                        className={`max-w-[70%] px-3 py-2 rounded-lg shadow ${msg.fromMe
                          ? "bg-[#005c4b] text-white rounded-br-none"
                          : "bg-[#202c33] text-white rounded-bl-none"
                          }`}
                      >
                        {/* Sender name for group messages */}
                        {!msg.fromMe && chat?.isGroup && msg.senderName && (
                          <p className="text-xs text-green-400 font-medium mb-1 ltr-num">
                            {msg.senderName}
                          </p>
                        )}

                        {/* Message content */}
                        {renderMessageContent(msg)}

                        {/* Time and status */}
                        <div className="flex items-center justify-end gap-1 mt-1">
                          <span className="text-[10px] text-gray-300 ltr-num">
                            {formatTime(msg.timestamp)}
                          </span>
                          {msg.fromMe && (
                            <CheckCheck className="w-4 h-4 text-blue-400" />
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              });
            })()}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Input */}
      <div className="p-4 bg-gradient-to-r from-[#202c33] to-[#1a252b] border-t border-gray-700">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (messageInput.trim() && chatId && !isSending) {
              setIsSending(true);
              sendMessage(chatId, messageInput);
              setMessageInput("");
              setTimeout(() => {
                setIsSending(false);
                fetchMessages(chatId);
              }, 1000);
            }
          }}
          className="flex items-center gap-3"
        >
          <input
            type="text"
            placeholder="اكتب رسالة..."
            value={messageInput}
            onChange={(e) => setMessageInput(e.target.value)}
            className="flex-1 bg-[#2a3942] text-white px-4 py-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 transition-all placeholder-gray-400 text-sm"
          />
          <button
            type="submit"
            disabled={!messageInput.trim() || isSending}
            className={`p-3 rounded-xl transition-all duration-300 transform ${messageInput.trim() && !isSending
              ? 'bg-gradient-to-r from-green-500 to-emerald-500 text-white hover:from-green-600 hover:to-emerald-600 shadow-lg shadow-green-500/30 hover:scale-105 active:scale-95'
              : 'bg-gray-700 text-gray-500 cursor-not-allowed'
              }`}
          >
            {isSending ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <Send className="w-5 h-5" />
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
