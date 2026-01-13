"use client";

import { useMemo } from "react";
import { useSocket } from "@/context/SocketContext";
import {
  MessageCircle,
  Users,
  CheckCheck,
  Clock,
  TrendingUp,
  BarChart3,
  Image as ImageIcon,
  Video,
  Mic,
  FileText,
  UserCheck,
  UserX,
  Activity,
  Zap,
  Target,
  Award,
  Calendar,
  MessageSquare,
  RefreshCw,
  Loader2,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  AreaChart,
  Area,
  Legend,
  RadialBarChart,
  RadialBar,
} from "recharts";

// Stat Card Component
function StatCard({
  title,
  value,
  icon: Icon,
  gradient,
  subValue,
  trend
}: {
  title: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
  gradient: string;
  subValue?: string;
  trend?: "up" | "down" | "neutral";
}) {
  return (
    <div className="relative overflow-hidden bg-gradient-to-br from-[#1a2730] to-[#111b21] rounded-2xl p-5 border border-gray-700/30 hover:border-gray-600/50 transition-all duration-300 hover:shadow-lg hover:shadow-green-500/5 group">
      {/* Background decoration */}
      <div className={`absolute -top-10 -right-10 w-32 h-32 rounded-full bg-gradient-to-br ${gradient} opacity-10 blur-2xl group-hover:opacity-20 transition-opacity`} />

      <div className="relative flex items-start justify-between">
        <div className="flex-1">
          <p className="text-gray-400 text-sm mb-1">{title}</p>
          <p className="text-3xl font-bold text-white ltr-num">{value}</p>
          {subValue && (
            <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
              {trend === "up" && <TrendingUp className="w-3 h-3 text-green-400" />}
              {trend === "down" && <TrendingUp className="w-3 h-3 text-red-400 rotate-180" />}
              {subValue}
            </p>
          )}
        </div>
        <div className={`p-3 rounded-xl bg-gradient-to-br ${gradient} shadow-lg`}>
          <Icon className="w-6 h-6 text-white" />
        </div>
      </div>
    </div>
  );
}

// Progress Ring Component
function ProgressRing({ value, label, color }: { value: number; label: string; color: string }) {
  const circumference = 2 * Math.PI * 40;
  const offset = circumference - (value / 100) * circumference;

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative w-24 h-24">
        <svg className="w-24 h-24 transform -rotate-90">
          <circle
            cx="48"
            cy="48"
            r="40"
            stroke="#202c33"
            strokeWidth="8"
            fill="none"
          />
          <circle
            cx="48"
            cy="48"
            r="40"
            stroke={color}
            strokeWidth="8"
            fill="none"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className="transition-all duration-1000 ease-out"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-xl font-bold text-white ltr-num">{value}%</span>
        </div>
      </div>
      <span className="text-sm text-gray-400">{label}</span>
    </div>
  );
}

// Chart Card Wrapper
function ChartCard({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-gradient-to-br from-[#1a2730] to-[#111b21] rounded-2xl p-6 border border-gray-700/30 ${className}`}>
      <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
        <div className="w-1 h-6 bg-gradient-to-b from-green-500 to-teal-500 rounded-full" />
        {title}
      </h3>
      {children}
    </div>
  );
}

export default function AnalyticsCharts() {
  const { chats, fetchChats, isLoading, isReady } = useSocket();

  // Calculate all statistics
  const stats = useMemo(() => {
    const totalChats = chats.length;
    const groupChats = chats.filter((c) => c.isGroup).length;
    const privateChats = totalChats - groupChats;
    const replied = chats.filter((c) => c.lastMessage?.fromMe === true).length;
    const notReplied = chats.filter((c) => c.lastMessage?.fromMe === false).length;
    const unreadTotal = chats.reduce((sum, c) => sum + (c.unreadCount || 0), 0);

    // Message type counts
    const messageTypes = {
      text: 0,
      image: 0,
      video: 0,
      audio: 0,
      document: 0,
      sticker: 0,
      other: 0
    };

    chats.forEach(chat => {
      const type = chat.lastMessage?.type || "chat";
      if (type === "chat") messageTypes.text++;
      else if (type === "image") messageTypes.image++;
      else if (type === "video") messageTypes.video++;
      else if (["audio", "ptt"].includes(type)) messageTypes.audio++;
      else if (type === "document") messageTypes.document++;
      else if (type === "sticker") messageTypes.sticker++;
      else messageTypes.other++;
    });

    // Time-based statistics (today vs older)
    const now = Date.now() / 1000;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayTimestamp = today.getTime() / 1000;

    const todayChats = chats.filter(c =>
      (c.lastMessage?.timestamp || c.timestamp || 0) >= todayTimestamp
    ).length;

    // Response rate
    const responseRate = totalChats > 0 ? Math.round((replied / totalChats) * 100) : 0;

    // Activity by hour (mock based on timestamps)
    const hourlyActivity = Array(24).fill(0).map((_, hour) => ({
      hour: `${hour.toString().padStart(2, '0')}:00`,
      messages: 0
    }));

    chats.forEach(chat => {
      const timestamp = chat.lastMessage?.timestamp || chat.timestamp;
      if (timestamp) {
        const date = new Date(timestamp * 1000);
        const hour = date.getHours();
        hourlyActivity[hour].messages++;
      }
    });

    // Find peak hour
    const peakHour = hourlyActivity.reduce((max, curr) =>
      curr.messages > max.messages ? curr : max
      , hourlyActivity[0]);

    // Days of week activity
    const daysOfWeek = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
    const weeklyActivity = daysOfWeek.map((day, index) => ({
      day,
      messages: 0
    }));

    chats.forEach(chat => {
      const timestamp = chat.lastMessage?.timestamp || chat.timestamp;
      if (timestamp) {
        const date = new Date(timestamp * 1000);
        const dayIndex = date.getDay();
        weeklyActivity[dayIndex].messages++;
      }
    });

    // Most active day
    const mostActiveDay = weeklyActivity.reduce((max, curr) =>
      curr.messages > max.messages ? curr : max
      , weeklyActivity[0]);

    // Group vs Private pie data
    const chatTypePie = [
      { name: "محادثات خاصة", value: privateChats, color: "#8b5cf6" },
      { name: "مجموعات", value: groupChats, color: "#06b6d4" },
    ];

    // Response status pie data
    const responsePie = [
      { name: "تم الرد", value: replied, color: "#22c55e" },
      { name: "بانتظار الرد", value: notReplied, color: "#f97316" },
    ];

    // Message types pie data
    const messageTypePie = [
      { name: "نصية", value: messageTypes.text, color: "#3b82f6" },
      { name: "صور", value: messageTypes.image, color: "#8b5cf6" },
      { name: "فيديو", value: messageTypes.video, color: "#ec4899" },
      { name: "صوتية", value: messageTypes.audio, color: "#22c55e" },
      { name: "مستندات", value: messageTypes.document, color: "#f97316" },
      { name: "ملصقات", value: messageTypes.sticker, color: "#eab308" },
    ].filter(item => item.value > 0);

    // Radial bar for engagement
    const engagementData = [
      { name: "معدل الرد", value: responseRate, fill: "#22c55e" },
      { name: "المحادثات اليوم", value: totalChats > 0 ? Math.round((todayChats / totalChats) * 100) : 0, fill: "#3b82f6" },
    ];

    return {
      totalChats,
      groupChats,
      privateChats,
      replied,
      notReplied,
      unreadTotal,
      responseRate,
      todayChats,
      messageTypes,
      hourlyActivity,
      weeklyActivity,
      peakHour,
      mostActiveDay,
      chatTypePie,
      responsePie,
      messageTypePie,
      engagementData
    };
  }, [chats]);

  return (
    <div className="p-6 space-y-6 bg-[#0b141a] min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <div className="p-2 rounded-xl bg-gradient-to-br from-green-500 to-teal-600 shadow-lg shadow-green-500/25">
              <BarChart3 className="w-6 h-6 text-white" />
            </div>
            لوحة التحليلات
          </h1>
          <p className="text-gray-400 text-sm mt-1">تحليل شامل لمحادثات الواتساب</p>
        </div>
        <button
          onClick={() => fetchChats()}
          disabled={isLoading || !isReady}
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-green-600 to-emerald-500 hover:from-green-700 hover:to-emerald-600 rounded-xl text-white text-sm transition-all duration-200 disabled:opacity-50 shadow-lg shadow-green-500/25"
        >
          {isLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4" />
          )}
          تحديث البيانات
        </button>
      </div>

      {/* Quick Stats Grid */}
      <div className="stats-grid">
        <StatCard
          title="إجمالي المحادثات"
          value={stats.totalChats}
          icon={MessageCircle}
          gradient="from-blue-500 to-blue-600"
          subValue={`${stats.todayChats} اليوم`}
          trend="up"
        />
        <StatCard
          title="المجموعات"
          value={stats.groupChats}
          icon={Users}
          gradient="from-cyan-500 to-cyan-600"
        />
        <StatCard
          title="محادثات خاصة"
          value={stats.privateChats}
          icon={UserCheck}
          gradient="from-purple-500 to-purple-600"
        />
        <StatCard
          title="تم الرد"
          value={stats.replied}
          icon={CheckCheck}
          gradient="from-green-500 to-green-600"
        />
        <StatCard
          title="بانتظار الرد"
          value={stats.notReplied}
          icon={Clock}
          gradient="from-orange-500 to-orange-600"
        />
        <StatCard
          title="غير مقروءة"
          value={stats.unreadTotal}
          icon={MessageSquare}
          gradient="from-red-500 to-red-600"
        />
      </div>

      {/* Engagement Overview */}
      <div className="charts-grid-3">
        {/* Response Rate Ring */}
        <ChartCard title="مؤشرات الأداء">
          <div className="flex items-center justify-around py-4">
            <ProgressRing
              value={stats.responseRate}
              label="معدل الرد"
              color="#22c55e"
            />
            <ProgressRing
              value={stats.totalChats > 0 ? Math.round((stats.todayChats / stats.totalChats) * 100) : 0}
              label="نشاط اليوم"
              color="#3b82f6"
            />
            <ProgressRing
              value={stats.totalChats > 0 ? Math.round((stats.groupChats / stats.totalChats) * 100) : 0}
              label="المجموعات"
              color="#8b5cf6"
            />
          </div>
        </ChartCard>

        {/* Response Status Pie */}
        <ChartCard title="حالة الرد">
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={stats.responsePie}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={80}
                paddingAngle={5}
                dataKey="value"
              >
                {stats.responsePie.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: "#111b21",
                  border: "1px solid #2a3942",
                  borderRadius: "8px",
                  color: "#fff",
                }}
              />
              <Legend
                verticalAlign="bottom"
                height={36}
                formatter={(value) => <span className="text-gray-300 text-sm">{value}</span>}
              />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Chat Types Pie */}
        <ChartCard title="أنواع المحادثات">
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={stats.chatTypePie}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={80}
                paddingAngle={5}
                dataKey="value"
              >
                {stats.chatTypePie.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: "#111b21",
                  border: "1px solid #2a3942",
                  borderRadius: "8px",
                  color: "#fff",
                }}
              />
              <Legend
                verticalAlign="bottom"
                height={36}
                formatter={(value) => <span className="text-gray-300 text-sm">{value}</span>}
              />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Activity Charts */}
      <div className="charts-grid-2">
        {/* Weekly Activity Bar Chart */}
        <ChartCard title="النشاط الأسبوعي">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={stats.weeklyActivity}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a3942" />
              <XAxis dataKey="day" stroke="#9ca3af" fontSize={12} />
              <YAxis stroke="#9ca3af" fontSize={12} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#111b21",
                  border: "1px solid #2a3942",
                  borderRadius: "8px",
                  color: "#fff",
                }}
                labelFormatter={(label) => `يوم ${label}`}
                formatter={(value) => [`${value ?? 0} محادثة`, "المحادثات"]}
              />
              <Bar
                dataKey="messages"
                fill="url(#greenGradient)"
                radius={[8, 8, 0, 0]}
                name="المحادثات"
              />
              <defs>
                <linearGradient id="greenGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#22c55e" />
                  <stop offset="100%" stopColor="#059669" />
                </linearGradient>
              </defs>
            </BarChart>
          </ResponsiveContainer>
          <div className="mt-4 flex items-center justify-center gap-2 text-sm text-gray-400">
            <Award className="w-4 h-4 text-yellow-500" />
            <span>أكثر يوم نشاطًا: <span className="text-white font-medium">{stats.mostActiveDay.day}</span> ({stats.mostActiveDay.messages} محادثة)</span>
          </div>
        </ChartCard>

        {/* Hourly Activity Area Chart */}
        <ChartCard title="النشاط على مدار اليوم">
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={stats.hourlyActivity}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a3942" />
              <XAxis dataKey="hour" stroke="#9ca3af" fontSize={10} interval={2} />
              <YAxis stroke="#9ca3af" fontSize={12} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#111b21",
                  border: "1px solid #2a3942",
                  borderRadius: "8px",
                  color: "#fff",
                }}
                formatter={(value) => [`${value ?? 0} محادثة`, "المحادثات"]}
              />
              <defs>
                <linearGradient id="blueGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.8} />
                  <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.1} />
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey="messages"
                stroke="#3b82f6"
                fill="url(#blueGradient)"
                strokeWidth={2}
                name="المحادثات"
              />
            </AreaChart>
          </ResponsiveContainer>
          <div className="mt-4 flex items-center justify-center gap-2 text-sm text-gray-400">
            <Zap className="w-4 h-4 text-blue-500" />
            <span>ذروة النشاط: <span className="text-white font-medium">{stats.peakHour.hour}</span> ({stats.peakHour.messages} محادثة)</span>
          </div>
        </ChartCard>
      </div>

      {/* Message Types */}
      <div className="charts-grid-2">
        {/* Message Types Pie */}
        <ChartCard title="أنواع الرسائل">
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie
                data={stats.messageTypePie}
                cx="50%"
                cy="50%"
                outerRadius={100}
                paddingAngle={2}
                dataKey="value"
                label={({ name, percent }) =>
                  `${name} (${((percent ?? 0) * 100).toFixed(0)}%)`
                }
                labelLine={false}
              >
                {stats.messageTypePie.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: "#111b21",
                  border: "1px solid #2a3942",
                  borderRadius: "8px",
                  color: "#fff",
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Message Types Grid */}
        <ChartCard title="توزيع الوسائط">
          <div className="media-grid">
            <div className="bg-[#202c33] rounded-xl p-4 text-center">
              <div className="w-12 h-12 mx-auto mb-2 rounded-full bg-blue-500/20 flex items-center justify-center">
                <MessageCircle className="w-6 h-6 text-blue-400" />
              </div>
              <p className="text-2xl font-bold text-white ltr-num">{stats.messageTypes.text}</p>
              <p className="text-xs text-gray-400">رسائل نصية</p>
            </div>
            <div className="bg-[#202c33] rounded-xl p-4 text-center">
              <div className="w-12 h-12 mx-auto mb-2 rounded-full bg-purple-500/20 flex items-center justify-center">
                <ImageIcon className="w-6 h-6 text-purple-400" />
              </div>
              <p className="text-2xl font-bold text-white ltr-num">{stats.messageTypes.image}</p>
              <p className="text-xs text-gray-400">صور</p>
            </div>
            <div className="bg-[#202c33] rounded-xl p-4 text-center">
              <div className="w-12 h-12 mx-auto mb-2 rounded-full bg-pink-500/20 flex items-center justify-center">
                <Video className="w-6 h-6 text-pink-400" />
              </div>
              <p className="text-2xl font-bold text-white ltr-num">{stats.messageTypes.video}</p>
              <p className="text-xs text-gray-400">فيديو</p>
            </div>
            <div className="bg-[#202c33] rounded-xl p-4 text-center">
              <div className="w-12 h-12 mx-auto mb-2 rounded-full bg-green-500/20 flex items-center justify-center">
                <Mic className="w-6 h-6 text-green-400" />
              </div>
              <p className="text-2xl font-bold text-white ltr-num">{stats.messageTypes.audio}</p>
              <p className="text-xs text-gray-400">رسائل صوتية</p>
            </div>
            <div className="bg-[#202c33] rounded-xl p-4 text-center">
              <div className="w-12 h-12 mx-auto mb-2 rounded-full bg-orange-500/20 flex items-center justify-center">
                <FileText className="w-6 h-6 text-orange-400" />
              </div>
              <p className="text-2xl font-bold text-white ltr-num">{stats.messageTypes.document}</p>
              <p className="text-xs text-gray-400">مستندات</p>
            </div>
            <div className="bg-[#202c33] rounded-xl p-4 text-center">
              <div className="w-12 h-12 mx-auto mb-2 rounded-full bg-yellow-500/20 flex items-center justify-center">
                <Activity className="w-6 h-6 text-yellow-400" />
              </div>
              <p className="text-2xl font-bold text-white ltr-num">{stats.messageTypes.sticker + stats.messageTypes.other}</p>
              <p className="text-xs text-gray-400">أخرى</p>
            </div>
          </div>
        </ChartCard>
      </div>

      {/* Summary Cards */}
      <div className="summary-grid">
        <div className="bg-gradient-to-br from-green-500/10 to-teal-500/10 border border-green-500/20 rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-lg bg-green-500/20">
              <Target className="w-5 h-5 text-green-400" />
            </div>
            <h3 className="text-lg font-semibold text-white">معدل الاستجابة</h3>
          </div>
          <div className="text-center">
            <p className="text-5xl font-bold text-green-400 ltr-num">{stats.responseRate}%</p>
            <p className="text-sm text-gray-400 mt-2">
              {stats.responseRate >= 80 ? "ممتاز! استمر كذلك 🎉" :
                stats.responseRate >= 50 ? "جيد، يمكن تحسينه 💪" :
                  "يحتاج متابعة أكثر ⚠️"}
            </p>
          </div>
        </div>

        <div className="bg-gradient-to-br from-blue-500/10 to-cyan-500/10 border border-blue-500/20 rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-lg bg-blue-500/20">
              <Calendar className="w-5 h-5 text-blue-400" />
            </div>
            <h3 className="text-lg font-semibold text-white">أكثر يوم نشاطًا</h3>
          </div>
          <div className="text-center">
            <p className="text-3xl font-bold text-blue-400">{stats.mostActiveDay.day}</p>
            <p className="text-sm text-gray-400 mt-2 ltr-num">{stats.mostActiveDay.messages} محادثة</p>
          </div>
        </div>

        <div className="bg-gradient-to-br from-purple-500/10 to-pink-500/10 border border-purple-500/20 rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-lg bg-purple-500/20">
              <Zap className="w-5 h-5 text-purple-400" />
            </div>
            <h3 className="text-lg font-semibold text-white">ذروة النشاط</h3>
          </div>
          <div className="text-center">
            <p className="text-3xl font-bold text-purple-400 ltr-num">{stats.peakHour.hour}</p>
            <p className="text-sm text-gray-400 mt-2 ltr-num">{stats.peakHour.messages} محادثة</p>
          </div>
        </div>
      </div>
    </div>
  );
}
