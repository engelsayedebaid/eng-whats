import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

// Simple hash function (for demo - in production use bcrypt)
function simpleHash(password: string): string {
  let hash = 0;
  for (let i = 0; i < password.length; i++) {
    const char = password.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  // Add salt
  const salt = "whatsapp_pro_2024";
  for (let i = 0; i < salt.length; i++) {
    const char = salt.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString(16);
}

// Register a new user
export const register = mutation({
  args: {
    email: v.string(),
    password: v.string(),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Check if email already exists
    const existing = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email.toLowerCase()))
      .first();

    if (existing) {
      throw new Error("البريد الإلكتروني مستخدم بالفعل");
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(args.email)) {
      throw new Error("البريد الإلكتروني غير صالح");
    }

    // Validate password length
    if (args.password.length < 6) {
      throw new Error("كلمة المرور يجب أن تكون 6 أحرف على الأقل");
    }

    // Hash password
    const passwordHash = simpleHash(args.password);

    // Create user
    const userId = await ctx.db.insert("users", {
      email: args.email.toLowerCase(),
      passwordHash,
      name: args.name,
      role: "user",
      isActive: true,
      lastLogin: now,
      createdAt: now,
      updatedAt: now,
    });

    return {
      success: true,
      userId: userId,
      email: args.email,
      name: args.name,
    };
  },
});

// Login user
export const login = mutation({
  args: {
    email: v.string(),
    password: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Find user by email
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email.toLowerCase()))
      .first();

    if (!user) {
      throw new Error("البريد الإلكتروني أو كلمة المرور غير صحيحة");
    }

    // Check if user is active
    if (!user.isActive) {
      throw new Error("الحساب معطل");
    }

    // Verify password
    const passwordHash = simpleHash(args.password);
    if (user.passwordHash !== passwordHash) {
      throw new Error("البريد الإلكتروني أو كلمة المرور غير صحيحة");
    }

    // Update last login
    await ctx.db.patch(user._id, { lastLogin: now, updatedAt: now });

    return {
      success: true,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    };
  },
});

// Get user by email
export const getByEmail = query({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email.toLowerCase()))
      .first();

    if (!user) return null;

    return {
      id: user._id,
      email: user.email,
      name: user.name,
      role: user.role,
      isActive: user.isActive,
      lastLogin: user.lastLogin,
    };
  },
});

// Check if user exists
export const exists = query({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email.toLowerCase()))
      .first();

    return user !== null;
  },
});

// Get all users (admin only)
export const getAll = query({
  args: {},
  handler: async (ctx) => {
    const users = await ctx.db.query("users").collect();
    return users.map((user) => ({
      id: user._id,
      email: user.email,
      name: user.name,
      role: user.role,
      isActive: user.isActive,
      lastLogin: user.lastLogin,
      createdAt: user.createdAt,
    }));
  },
});

// Update user
export const update = mutation({
  args: {
    email: v.string(),
    name: v.optional(v.string()),
    isActive: v.optional(v.boolean()),
    role: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email.toLowerCase()))
      .first();

    if (!user) {
      throw new Error("المستخدم غير موجود");
    }

    const updateData: Record<string, unknown> = { updatedAt: now };
    if (args.name !== undefined) updateData.name = args.name;
    if (args.isActive !== undefined) updateData.isActive = args.isActive;
    if (args.role !== undefined) updateData.role = args.role;

    await ctx.db.patch(user._id, updateData);

    return { success: true };
  },
});

// Change password
export const changePassword = mutation({
  args: {
    email: v.string(),
    currentPassword: v.string(),
    newPassword: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email.toLowerCase()))
      .first();

    if (!user) {
      throw new Error("المستخدم غير موجود");
    }

    // Verify current password
    const currentHash = simpleHash(args.currentPassword);
    if (user.passwordHash !== currentHash) {
      throw new Error("كلمة المرور الحالية غير صحيحة");
    }

    // Validate new password
    if (args.newPassword.length < 6) {
      throw new Error("كلمة المرور الجديدة يجب أن تكون 6 أحرف على الأقل");
    }

    // Update password
    const newHash = simpleHash(args.newPassword);
    await ctx.db.patch(user._id, { passwordHash: newHash, updatedAt: now });

    return { success: true };
  },
});

// Create default admin user if not exists
export const createDefaultAdmin = mutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();

    // Check if any admin exists
    const existingAdmin = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", "admin@whatsapp.pro"))
      .first();

    if (existingAdmin) {
      return { success: false, message: "Admin already exists" };
    }

    // Create default admin
    const passwordHash = simpleHash("admin123");
    await ctx.db.insert("users", {
      email: "admin@whatsapp.pro",
      passwordHash,
      name: "مدير النظام",
      role: "admin",
      isActive: true,
      lastLogin: now,
      createdAt: now,
      updatedAt: now,
    });

    return { success: true, message: "Default admin created" };
  },
});
