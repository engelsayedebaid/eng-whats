import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

// Get session by accountId
export const getByAccountId = query({
  args: { accountId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("sessions")
      .withIndex("by_accountId", (q) => q.eq("accountId", args.accountId))
      .first();
  },
});

// Get all sessions
export const getAll = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("sessions").collect();
  },
});

// Create or update session
export const upsert = mutation({
  args: {
    accountId: v.string(),
    sessionData: v.optional(v.string()),
    isAuthenticated: v.boolean(),
    isReady: v.boolean(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("sessions")
      .withIndex("by_accountId", (q) => q.eq("accountId", args.accountId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        sessionData: args.sessionData,
        isAuthenticated: args.isAuthenticated,
        isReady: args.isReady,
        lastConnected: args.isReady ? now : existing.lastConnected,
        updatedAt: now,
      });
      return existing._id;
    } else {
      return await ctx.db.insert("sessions", {
        accountId: args.accountId,
        sessionData: args.sessionData,
        isAuthenticated: args.isAuthenticated,
        isReady: args.isReady,
        lastConnected: args.isReady ? now : undefined,
        createdAt: now,
        updatedAt: now,
      });
    }
  },
});

// Update session ready state
export const setReady = mutation({
  args: {
    accountId: v.string(),
    isReady: v.boolean(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_accountId", (q) => q.eq("accountId", args.accountId))
      .first();

    if (session) {
      await ctx.db.patch(session._id, {
        isReady: args.isReady,
        lastConnected: args.isReady ? now : session.lastConnected,
        updatedAt: now,
      });
    } else {
      // Create new session if doesn't exist
      await ctx.db.insert("sessions", {
        accountId: args.accountId,
        isAuthenticated: false,
        isReady: args.isReady,
        lastConnected: args.isReady ? now : undefined,
        createdAt: now,
        updatedAt: now,
      });
    }
  },
});

// Mark session as authenticated
export const setAuthenticated = mutation({
  args: {
    accountId: v.string(),
    isAuthenticated: v.boolean(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_accountId", (q) => q.eq("accountId", args.accountId))
      .first();

    if (session) {
      await ctx.db.patch(session._id, {
        isAuthenticated: args.isAuthenticated,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("sessions", {
        accountId: args.accountId,
        isAuthenticated: args.isAuthenticated,
        isReady: false,
        createdAt: now,
        updatedAt: now,
      });
    }
  },
});

// Mark session as disconnected
export const setDisconnected = mutation({
  args: {
    accountId: v.string(),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_accountId", (q) => q.eq("accountId", args.accountId))
      .first();

    if (session) {
      await ctx.db.patch(session._id, {
        isReady: false,
        lastDisconnected: now,
        disconnectReason: args.reason,
        updatedAt: now,
      });
    }
  },
});

// Delete session
export const remove = mutation({
  args: { accountId: v.string() },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_accountId", (q) => q.eq("accountId", args.accountId))
      .first();

    if (session) {
      await ctx.db.delete(session._id);
    }
  },
});

// Store session data (for persistence)
export const storeSessionData = mutation({
  args: {
    accountId: v.string(),
    sessionData: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_accountId", (q) => q.eq("accountId", args.accountId))
      .first();

    if (session) {
      await ctx.db.patch(session._id, {
        sessionData: args.sessionData,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("sessions", {
        accountId: args.accountId,
        sessionData: args.sessionData,
        isAuthenticated: true,
        isReady: false,
        createdAt: now,
        updatedAt: now,
      });
    }
  },
});
