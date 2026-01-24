import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

// Get all accounts
export const getAll = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("accounts")
      .order("asc")
      .collect();
  },
});

// Get active account
export const getActive = query({
  args: {},
  handler: async (ctx) => {
    const activeAccount = await ctx.db
      .query("accounts")
      .withIndex("by_isActive", (q) => q.eq("isActive", true))
      .first();
    return activeAccount;
  },
});

// Get account by accountId
export const getByAccountId = query({
  args: { accountId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("accounts")
      .withIndex("by_accountId", (q) => q.eq("accountId", args.accountId))
      .first();
  },
});

// Create a new account
export const create = mutation({
  args: {
    accountId: v.string(),
    name: v.string(),
    phone: v.optional(v.string()),
    isActive: v.boolean(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // If this account is active, deactivate all others
    if (args.isActive) {
      const allAccounts = await ctx.db.query("accounts").collect();
      for (const account of allAccounts) {
        if (account.isActive) {
          await ctx.db.patch(account._id, { isActive: false, updatedAt: now });
        }
      }
    }

    const accountId = await ctx.db.insert("accounts", {
      accountId: args.accountId,
      name: args.name,
      phone: args.phone,
      isActive: args.isActive,
      createdAt: now,
      updatedAt: now,
    });

    return accountId;
  },
});

// Update account (upsert - creates if not exists)
export const update = mutation({
  args: {
    accountId: v.string(),
    name: v.optional(v.string()),
    phone: v.optional(v.string()),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const account = await ctx.db
      .query("accounts")
      .withIndex("by_accountId", (q) => q.eq("accountId", args.accountId))
      .first();

    // If account doesn't exist, create it
    if (!account) {
      console.log(`Account not found, creating: ${args.accountId}`);
      const newAccountId = await ctx.db.insert("accounts", {
        accountId: args.accountId,
        name: args.name || `حساب ${args.accountId.slice(-4)}`,
        phone: args.phone,
        isActive: args.isActive || false,
        createdAt: now,
        updatedAt: now,
      });
      return newAccountId;
    }

    // If setting this account as active, deactivate all others
    if (args.isActive) {
      const allAccounts = await ctx.db.query("accounts").collect();
      for (const acc of allAccounts) {
        if (acc._id !== account._id && acc.isActive) {
          await ctx.db.patch(acc._id, { isActive: false, updatedAt: now });
        }
      }
    }

    const updateData: Record<string, unknown> = { updatedAt: now };
    if (args.name !== undefined) updateData.name = args.name;
    if (args.phone !== undefined) updateData.phone = args.phone;
    if (args.isActive !== undefined) updateData.isActive = args.isActive;

    await ctx.db.patch(account._id, updateData);

    return account._id;
  },
});

// Set active account
export const setActive = mutation({
  args: { accountId: v.string() },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Deactivate all accounts
    const allAccounts = await ctx.db.query("accounts").collect();
    for (const account of allAccounts) {
      if (account.isActive) {
        await ctx.db.patch(account._id, { isActive: false, updatedAt: now });
      }
    }

    // Activate the specified account
    const account = await ctx.db
      .query("accounts")
      .withIndex("by_accountId", (q) => q.eq("accountId", args.accountId))
      .first();

    if (account) {
      await ctx.db.patch(account._id, { isActive: true, updatedAt: now });
    }

    return args.accountId;
  },
});

// Delete account
export const remove = mutation({
  args: { accountId: v.string() },
  handler: async (ctx, args) => {
    const account = await ctx.db
      .query("accounts")
      .withIndex("by_accountId", (q) => q.eq("accountId", args.accountId))
      .first();

    if (account) {
      await ctx.db.delete(account._id);

      // Also delete associated sessions, chats, and sync status
      const sessions = await ctx.db
        .query("sessions")
        .withIndex("by_accountId", (q) => q.eq("accountId", args.accountId))
        .collect();
      for (const session of sessions) {
        await ctx.db.delete(session._id);
      }

      const chats = await ctx.db
        .query("chats")
        .withIndex("by_accountId", (q) => q.eq("accountId", args.accountId))
        .collect();
      for (const chat of chats) {
        await ctx.db.delete(chat._id);
      }

      const syncStatuses = await ctx.db
        .query("syncStatus")
        .withIndex("by_accountId", (q) => q.eq("accountId", args.accountId))
        .collect();
      for (const status of syncStatuses) {
        await ctx.db.delete(status._id);
      }
    }

    return args.accountId;
  },
});
