"use client";

import { useEffect, useState } from "react";
import { useSocket } from "@/context/SocketContext";
import ChatList from "@/components/ChatList";
import ChatWindow from "@/components/ChatWindow";

export default function ChatsPage() {
  const { fetchChats, isReady } = useSocket();
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);

  useEffect(() => {
    if (isReady) {
      fetchChats();
    }
  }, [isReady, fetchChats]);

  return (
    <div className="flex h-full">
      {/* Chat List */}
      <div className="w-80 lg:w-96 border-l border-gray-700 flex-shrink-0">
        <ChatList onSelectChat={setSelectedChatId} selectedChatId={selectedChatId} />
      </div>

      {/* Chat Window */}
      <ChatWindow chatId={selectedChatId} />
    </div>
  );
}
