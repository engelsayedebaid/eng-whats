import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // Users table - for email/password authentication
  users: defineTable({
    email: v.string(), // User email (unique)
    passwordHash: v.string(), // Hashed password
    name: v.string(), // Display name
    role: v.string(), // "admin" | "user"
    isActive: v.boolean(), // Whether user is active
    lastLogin: v.optional(v.number()), // Last login timestamp
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_email", ["email"]),

  // WhatsApp Accounts table
  accounts: defineTable({
    accountId: v.string(), // Unique account identifier (e.g., account_1234567890)
    userId: v.optional(v.string()), // Reference to user who owns this account
    name: v.string(), // Account display name (e.g., "حساب 1")
    phone: v.optional(v.string()), // Phone number once authenticated
    isActive: v.boolean(), // Whether this is the currently active account
    createdAt: v.number(), // Timestamp when account was created
    updatedAt: v.number(), // Timestamp when account was last updated
  }).index("by_accountId", ["accountId"])
    .index("by_isActive", ["isActive"])
    .index("by_userId", ["userId"]),

  // WhatsApp Sessions table - stores authentication data
  sessions: defineTable({
    accountId: v.string(), // Reference to account
    sessionData: v.optional(v.string()), // Serialized session data (JSON stringified)
    isAuthenticated: v.boolean(), // Whether session is authenticated
    isReady: v.boolean(), // Whether WhatsApp client is ready
    lastConnected: v.optional(v.number()), // Last successful connection time
    lastDisconnected: v.optional(v.number()), // Last disconnection time
    disconnectReason: v.optional(v.string()), // Reason for last disconnection
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_accountId", ["accountId"]),

  // Cached Chats table - stores chat list for each account
  chats: defineTable({
    accountId: v.string(), // Reference to account
    chatId: v.string(), // WhatsApp chat ID (e.g., 1234567890@c.us)
    name: v.string(), // Chat name
    phone: v.optional(v.string()), // Phone number
    profilePic: v.optional(v.string()), // Profile picture URL
    isGroup: v.boolean(), // Whether it's a group chat
    participantCount: v.optional(v.number()), // Number of participants if group
    unreadCount: v.number(), // Unread messages count
    lastMessageBody: v.optional(v.string()), // Last message text
    lastMessageFromMe: v.optional(v.boolean()), // Whether last message was from me
    lastMessageTimestamp: v.optional(v.number()), // Last message timestamp
    lastMessageType: v.optional(v.string()), // Last message type
    lastMessageTypeLabel: v.optional(v.string()), // Arabic label for message type
    lastMessageSenderName: v.optional(v.string()), // Sender name for group messages
    timestamp: v.number(), // Chat timestamp
    syncedAt: v.number(), // When this chat was last synced
  }).index("by_accountId", ["accountId"])
    .index("by_accountId_chatId", ["accountId", "chatId"]),

  // Sync Status table - tracks synchronization progress
  syncStatus: defineTable({
    accountId: v.string(),
    status: v.string(), // "idle" | "syncing" | "completed" | "failed"
    progress: v.number(), // Percentage 0-100
    totalChats: v.number(),
    syncedChats: v.number(),
    currentChatName: v.optional(v.string()), // Name of currently syncing chat
    message: v.string(), // Status message in Arabic
    startedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    error: v.optional(v.string()),
    updatedAt: v.number(),
  }).index("by_accountId", ["accountId"]),

  // Connection Events log - for debugging and analytics
  connectionEvents: defineTable({
    accountId: v.string(),
    event: v.string(), // "qr_generated" | "authenticated" | "ready" | "disconnected" | "error"
    details: v.optional(v.string()), // Additional event details
    timestamp: v.number(),
  }).index("by_accountId", ["accountId"])
    .index("by_accountId_timestamp", ["accountId", "timestamp"]),
});

