import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

// Log a connection event
export const log = mutation({
  args: {
    accountId: v.string(),
    event: v.string(),
    details: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("connectionEvents", {
      accountId: args.accountId,
      event: args.event,
      details: args.details,
      timestamp: Date.now(),
    });
  },
});

// Get recent events for an account
export const getRecent = query({
  args: {
    accountId: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit || 50;
    const events = await ctx.db
      .query("connectionEvents")
      .withIndex("by_accountId", (q) => q.eq("accountId", args.accountId))
      .order("desc")
      .take(limit);
    return events;
  },
});

// Get events by type for an account
export const getByEvent = query({
  args: {
    accountId: v.string(),
    event: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit || 20;
    const events = await ctx.db
      .query("connectionEvents")
      .withIndex("by_accountId", (q) => q.eq("accountId", args.accountId))
      .filter((q) => q.eq(q.field("event"), args.event))
      .order("desc")
      .take(limit);
    return events;
  },
});

// Clear old events (keep last N days)
export const clearOld = mutation({
  args: {
    daysToKeep: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const daysToKeep = args.daysToKeep || 7;
    const cutoffTime = Date.now() - (daysToKeep * 24 * 60 * 60 * 1000);

    // Get all events older than cutoff
    const oldEvents = await ctx.db
      .query("connectionEvents")
      .filter((q) => q.lt(q.field("timestamp"), cutoffTime))
      .collect();

    let deletedCount = 0;
    for (const event of oldEvents) {
      await ctx.db.delete(event._id);
      deletedCount++;
    }

    return { deletedCount };
  },
});
