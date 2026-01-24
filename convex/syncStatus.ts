import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

// Get sync status for an account
export const getByAccountId = query({
  args: { accountId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("syncStatus")
      .withIndex("by_accountId", (q) => q.eq("accountId", args.accountId))
      .first();
  },
});

// Update sync status
export const update = mutation({
  args: {
    accountId: v.string(),
    status: v.string(),
    progress: v.number(),
    totalChats: v.number(),
    syncedChats: v.number(),
    currentChatName: v.optional(v.string()),
    message: v.string(),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("syncStatus")
      .withIndex("by_accountId", (q) => q.eq("accountId", args.accountId))
      .first();

    const updateData = {
      status: args.status,
      progress: args.progress,
      totalChats: args.totalChats,
      syncedChats: args.syncedChats,
      currentChatName: args.currentChatName,
      message: args.message,
      error: args.error,
      updatedAt: now,
      startedAt: args.status === "syncing" && (!existing || existing.status !== "syncing")
        ? now
        : existing?.startedAt,
      completedAt: args.status === "completed" ? now : existing?.completedAt,
    };

    if (existing) {
      await ctx.db.patch(existing._id, updateData);
      return existing._id;
    } else {
      return await ctx.db.insert("syncStatus", {
        accountId: args.accountId,
        ...updateData,
      });
    }
  },
});

// Start sync
export const startSync = mutation({
  args: {
    accountId: v.string(),
    totalChats: v.number(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("syncStatus")
      .withIndex("by_accountId", (q) => q.eq("accountId", args.accountId))
      .first();

    const data = {
      status: "syncing",
      progress: 0,
      totalChats: args.totalChats,
      syncedChats: 0,
      message: "جاري بدء المزامنة...",
      startedAt: now,
      updatedAt: now,
    };

    if (existing) {
      await ctx.db.patch(existing._id, data);
    } else {
      await ctx.db.insert("syncStatus", {
        accountId: args.accountId,
        ...data,
      });
    }
  },
});

// Update sync progress
export const updateProgress = mutation({
  args: {
    accountId: v.string(),
    syncedChats: v.number(),
    totalChats: v.number(),
    currentChatName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const progress = args.totalChats > 0
      ? Math.round((args.syncedChats / args.totalChats) * 100)
      : 0;

    const existing = await ctx.db
      .query("syncStatus")
      .withIndex("by_accountId", (q) => q.eq("accountId", args.accountId))
      .first();

    const data = {
      status: "syncing",
      progress,
      totalChats: args.totalChats,
      syncedChats: args.syncedChats,
      currentChatName: args.currentChatName,
      message: `جاري مزامنة ${args.syncedChats} من ${args.totalChats}...`,
      updatedAt: now,
    };

    if (existing) {
      await ctx.db.patch(existing._id, data);
    } else {
      await ctx.db.insert("syncStatus", {
        accountId: args.accountId,
        ...data,
        startedAt: now,
      });
    }
  },
});

// Complete sync
export const completeSync = mutation({
  args: {
    accountId: v.string(),
    totalChats: v.number(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("syncStatus")
      .withIndex("by_accountId", (q) => q.eq("accountId", args.accountId))
      .first();

    const data = {
      status: "completed",
      progress: 100,
      totalChats: args.totalChats,
      syncedChats: args.totalChats,
      message: `تمت المزامنة بنجاح - ${args.totalChats} محادثة`,
      completedAt: now,
      updatedAt: now,
    };

    if (existing) {
      await ctx.db.patch(existing._id, data);
    } else {
      await ctx.db.insert("syncStatus", {
        accountId: args.accountId,
        ...data,
        startedAt: now,
      });
    }
  },
});

// Fail sync
export const failSync = mutation({
  args: {
    accountId: v.string(),
    error: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("syncStatus")
      .withIndex("by_accountId", (q) => q.eq("accountId", args.accountId))
      .first();

    const data = {
      status: "failed",
      message: "فشلت المزامنة",
      error: args.error,
      updatedAt: now,
    };

    if (existing) {
      await ctx.db.patch(existing._id, data);
    } else {
      await ctx.db.insert("syncStatus", {
        accountId: args.accountId,
        progress: 0,
        totalChats: 0,
        syncedChats: 0,
        ...data,
      });
    }
  },
});

// Reset sync status
export const reset = mutation({
  args: { accountId: v.string() },
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("syncStatus")
      .withIndex("by_accountId", (q) => q.eq("accountId", args.accountId))
      .first();

    const data = {
      status: "idle",
      progress: 0,
      totalChats: 0,
      syncedChats: 0,
      message: "جاهز للمزامنة",
      updatedAt: now,
    };

    if (existing) {
      await ctx.db.patch(existing._id, data);
    } else {
      await ctx.db.insert("syncStatus", {
        accountId: args.accountId,
        ...data,
      });
    }
  },
});
