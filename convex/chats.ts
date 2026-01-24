import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

// Get all chats for an account
export const getByAccountId = query({
  args: { accountId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("chats")
      .withIndex("by_accountId", (q) => q.eq("accountId", args.accountId))
      .order("desc")
      .collect();
  },
});

// Get a specific chat
export const getChat = query({
  args: {
    accountId: v.string(),
    chatId: v.string(),
  },
  handler: async (ctx, args) => {
    const chats = await ctx.db
      .query("chats")
      .withIndex("by_accountId_chatId", (q) =>
        q.eq("accountId", args.accountId).eq("chatId", args.chatId)
      )
      .collect();
    return chats[0] || null;
  },
});

// Upsert a single chat (create or update)
export const upsertChat = mutation({
  args: {
    accountId: v.string(),
    chatId: v.string(),
    name: v.string(),
    phone: v.optional(v.string()),
    profilePic: v.optional(v.string()),
    isGroup: v.boolean(),
    participantCount: v.optional(v.number()),
    unreadCount: v.number(),
    lastMessageBody: v.optional(v.string()),
    lastMessageFromMe: v.optional(v.boolean()),
    lastMessageTimestamp: v.optional(v.number()),
    lastMessageType: v.optional(v.string()),
    lastMessageTypeLabel: v.optional(v.string()),
    lastMessageSenderName: v.optional(v.string()),
    timestamp: v.number(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Check if chat already exists
    const existingChats = await ctx.db
      .query("chats")
      .withIndex("by_accountId_chatId", (q) =>
        q.eq("accountId", args.accountId).eq("chatId", args.chatId)
      )
      .collect();

    const existing = existingChats[0];

    if (existing) {
      // Update existing chat
      await ctx.db.patch(existing._id, {
        name: args.name,
        phone: args.phone,
        profilePic: args.profilePic,
        isGroup: args.isGroup,
        participantCount: args.participantCount,
        unreadCount: args.unreadCount,
        lastMessageBody: args.lastMessageBody,
        lastMessageFromMe: args.lastMessageFromMe,
        lastMessageTimestamp: args.lastMessageTimestamp,
        lastMessageType: args.lastMessageType,
        lastMessageTypeLabel: args.lastMessageTypeLabel,
        lastMessageSenderName: args.lastMessageSenderName,
        timestamp: args.timestamp,
        syncedAt: now,
      });
      return existing._id;
    } else {
      // Create new chat
      return await ctx.db.insert("chats", {
        accountId: args.accountId,
        chatId: args.chatId,
        name: args.name,
        phone: args.phone,
        profilePic: args.profilePic,
        isGroup: args.isGroup,
        participantCount: args.participantCount,
        unreadCount: args.unreadCount,
        lastMessageBody: args.lastMessageBody,
        lastMessageFromMe: args.lastMessageFromMe,
        lastMessageTimestamp: args.lastMessageTimestamp,
        lastMessageType: args.lastMessageType,
        lastMessageTypeLabel: args.lastMessageTypeLabel,
        lastMessageSenderName: args.lastMessageSenderName,
        timestamp: args.timestamp,
        syncedAt: now,
      });
    }
  },
});

// Batch upsert chats (for efficient syncing)
export const batchUpsertChats = mutation({
  args: {
    accountId: v.string(),
    chats: v.array(v.object({
      chatId: v.string(),
      name: v.string(),
      phone: v.optional(v.string()),
      profilePic: v.optional(v.string()),
      isGroup: v.boolean(),
      participantCount: v.optional(v.number()),
      unreadCount: v.number(),
      lastMessageBody: v.optional(v.string()),
      lastMessageFromMe: v.optional(v.boolean()),
      lastMessageTimestamp: v.optional(v.number()),
      lastMessageType: v.optional(v.string()),
      lastMessageTypeLabel: v.optional(v.string()),
      lastMessageSenderName: v.optional(v.string()),
      timestamp: v.number(),
    })),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    let upsertedCount = 0;

    for (const chat of args.chats) {
      const existingChats = await ctx.db
        .query("chats")
        .withIndex("by_accountId_chatId", (q) =>
          q.eq("accountId", args.accountId).eq("chatId", chat.chatId)
        )
        .collect();

      const existing = existingChats[0];

      if (existing) {
        await ctx.db.patch(existing._id, {
          ...chat,
          syncedAt: now,
        });
      } else {
        await ctx.db.insert("chats", {
          accountId: args.accountId,
          ...chat,
          syncedAt: now,
        });
      }
      upsertedCount++;
    }

    return { upsertedCount };
  },
});

// Clear all chats for an account
export const clearAccountChats = mutation({
  args: { accountId: v.string() },
  handler: async (ctx, args) => {
    const chats = await ctx.db
      .query("chats")
      .withIndex("by_accountId", (q) => q.eq("accountId", args.accountId))
      .collect();

    for (const chat of chats) {
      await ctx.db.delete(chat._id);
    }

    return { deletedCount: chats.length };
  },
});

// Delete a specific chat
export const removeChat = mutation({
  args: {
    accountId: v.string(),
    chatId: v.string(),
  },
  handler: async (ctx, args) => {
    const chats = await ctx.db
      .query("chats")
      .withIndex("by_accountId_chatId", (q) =>
        q.eq("accountId", args.accountId).eq("chatId", args.chatId)
      )
      .collect();

    if (chats[0]) {
      await ctx.db.delete(chats[0]._id);
    }
  },
});
