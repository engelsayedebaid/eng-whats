"use client";

import { useSocket } from "@/context/SocketContext";
import { Download, FileSpreadsheet } from "lucide-react";
import * as XLSX from "xlsx";

export default function ExportButton() {
  const { chats } = useSocket();

  const exportToExcel = () => {
    // Prepare data for export
    const data = chats.map((chat) => ({
      "اسم المحادثة": chat.name,
      "رقم المحادثة": chat.id.replace("@c.us", "").replace("@g.us", ""),
      "نوع المحادثة": chat.isGroup ? "مجموعة" : "خاصة",
      "آخر رسالة": chat.lastMessage?.body || "-",
      "من طرفي": chat.lastMessage?.fromMe ? "نعم" : "لا",
      "تاريخ آخر رسالة": chat.lastMessage?.timestamp
        ? new Date(chat.lastMessage.timestamp * 1000).toLocaleString("ar-EG")
        : "-",
      "عدد الرسائل غير المقروءة": chat.unreadCount || 0,
      "حالة الرد": chat.lastMessage?.fromMe ? "تم الرد" : "لم يتم الرد",
    }));

    // Create workbook and worksheet
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(data, {
      header: [
        "اسم المحادثة",
        "رقم المحادثة",
        "نوع المحادثة",
        "آخر رسالة",
        "من طرفي",
        "تاريخ آخر رسالة",
        "عدد الرسائل غير المقروءة",
        "حالة الرد",
      ],
    });

    // Set column widths
    ws["!cols"] = [
      { wch: 25 },
      { wch: 20 },
      { wch: 12 },
      { wch: 40 },
      { wch: 10 },
      { wch: 20 },
      { wch: 20 },
      { wch: 15 },
    ];

    XLSX.utils.book_append_sheet(wb, ws, "المحادثات");

    // Generate filename with date
    const date = new Date().toISOString().split("T")[0];
    const filename = `whatsapp_export_${date}.xlsx`;

    // Download
    XLSX.writeFile(wb, filename);
  };

  return (
    <button
      onClick={exportToExcel}
      disabled={chats.length === 0}
      className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${chats.length > 0
          ? "bg-gradient-to-r from-green-500 to-teal-600 text-white hover:from-green-600 hover:to-teal-700 shadow-lg hover:shadow-xl"
          : "bg-gray-600 text-gray-400 cursor-not-allowed"
        }`}
    >
      <FileSpreadsheet className="w-5 h-5" />
      تصدير إلى Excel
      <Download className="w-4 h-4" />
    </button>
  );
}
