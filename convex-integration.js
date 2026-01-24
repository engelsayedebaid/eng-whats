/**
 * Convex Integration for WhatsApp Management Server
 * This module provides functions to sync data between the server and Convex database
 */

const { ConvexHttpClient } = require("convex/browser");

// Initialize Convex client
const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL || "https://resilient-scorpion-536.convex.cloud";
const convex = new ConvexHttpClient(CONVEX_URL);

// Import API references - these will be generated after build
let api;
try {
  api = require("./convex/_generated/api").api;
} catch (e) {
  console.log("Convex API not yet generated. Run 'npx convex dev' first.");
  api = null;
}

// Helper function to clean null values from objects (Convex expects undefined, not null)
function cleanNullValues(obj) {
  const cleaned = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== null && value !== undefined) {
      cleaned[key] = value;
    }
  }
  return cleaned;
}

/**
 * Account Management
 */
const accountsDb = {
  // Get all accounts from Convex
  async getAll() {
    if (!api) return [];
    try {
      return await convex.query(api.accounts.getAll);
    } catch (e) {
      console.error("Error fetching accounts from Convex:", e.message);
      return [];
    }
  },

  // Get active account
  async getActive() {
    if (!api) return null;
    try {
      return await convex.query(api.accounts.getActive);
    } catch (e) {
      console.error("Error fetching active account:", e.message);
      return null;
    }
  },

  // Get account by ID
  async getById(accountId) {
    if (!api) return null;
    try {
      return await convex.query(api.accounts.getByAccountId, { accountId });
    } catch (e) {
      console.error("Error fetching account by ID:", e.message);
      return null;
    }
  },

  // Create new account
  async create(accountData) {
    if (!api) return null;
    try {
      return await convex.mutation(api.accounts.create, accountData);
    } catch (e) {
      console.error("Error creating account:", e.message);
      return null;
    }
  },

  // Update account
  async update(accountId, updates) {
    if (!api) return null;
    try {
      return await convex.mutation(api.accounts.update, { accountId, ...updates });
    } catch (e) {
      console.error("Error updating account:", e.message);
      return null;
    }
  },

  // Set active account
  async setActive(accountId) {
    if (!api) return null;
    try {
      return await convex.mutation(api.accounts.setActive, { accountId });
    } catch (e) {
      console.error("Error setting active account:", e.message);
      return null;
    }
  },

  // Delete account
  async remove(accountId) {
    if (!api) return null;
    try {
      return await convex.mutation(api.accounts.remove, { accountId });
    } catch (e) {
      console.error("Error deleting account:", e.message);
      return null;
    }
  },
};

/**
 * Session Management
 */
const sessionsDb = {
  // Get session by account ID
  async getByAccountId(accountId) {
    if (!api) return null;
    try {
      return await convex.query(api.sessions.getByAccountId, { accountId });
    } catch (e) {
      console.error("Error fetching session:", e.message);
      return null;
    }
  },

  // Create or update session
  async upsert(sessionData) {
    if (!api) return null;
    try {
      return await convex.mutation(api.sessions.upsert, sessionData);
    } catch (e) {
      console.error("Error upserting session:", e.message);
      return null;
    }
  },

  // Set ready state
  async setReady(accountId, isReady) {
    if (!api) return;
    try {
      await convex.mutation(api.sessions.setReady, { accountId, isReady });
    } catch (e) {
      console.error("Error setting ready state:", e.message);
    }
  },

  // Set authenticated state
  async setAuthenticated(accountId, isAuthenticated) {
    if (!api) return;
    try {
      await convex.mutation(api.sessions.setAuthenticated, { accountId, isAuthenticated });
    } catch (e) {
      console.error("Error setting authenticated state:", e.message);
    }
  },

  // Set disconnected
  async setDisconnected(accountId, reason) {
    if (!api) return;
    try {
      await convex.mutation(api.sessions.setDisconnected, { accountId, reason });
    } catch (e) {
      console.error("Error setting disconnected:", e.message);
    }
  },

  // Delete session
  async remove(accountId) {
    if (!api) return;
    try {
      await convex.mutation(api.sessions.remove, { accountId });
    } catch (e) {
      console.error("Error deleting session:", e.message);
    }
  },

  // Store session data for persistence
  async storeSessionData(accountId, sessionData) {
    if (!api) return;
    try {
      await convex.mutation(api.sessions.storeSessionData, { 
        accountId, 
        sessionData: JSON.stringify(sessionData) 
      });
    } catch (e) {
      console.error("Error storing session data:", e.message);
    }
  },
};

/**
 * Chats Management
 */
const chatsDb = {
  // Get all chats for an account
  async getByAccountId(accountId) {
    if (!api) return [];
    try {
      const chats = await convex.query(api.chats.getByAccountId, { accountId });
      // Transform Convex format back to original format
      return chats.map(chat => ({
        id: chat.chatId,
        name: chat.name,
        phone: chat.phone,
        profilePic: chat.profilePic,
        isGroup: chat.isGroup,
        participantCount: chat.participantCount,
        unreadCount: chat.unreadCount,
        timestamp: chat.timestamp,
        lastMessage: chat.lastMessageBody ? {
          body: chat.lastMessageBody,
          fromMe: chat.lastMessageFromMe,
          timestamp: chat.lastMessageTimestamp,
          type: chat.lastMessageType,
          typeLabel: chat.lastMessageTypeLabel,
          senderName: chat.lastMessageSenderName,
        } : null,
      }));
    } catch (e) {
      console.error("Error fetching chats:", e.message);
      return [];
    }
  },

  // Save a single chat
  async upsertChat(accountId, chat) {
    if (!api) return;
    try {
      await convex.mutation(api.chats.upsertChat, {
        accountId,
        chatId: chat.id,
        name: chat.name || "Unknown",
        phone: chat.phone || undefined,
        profilePic: chat.profilePic || undefined,
        isGroup: chat.isGroup || false,
        participantCount: chat.participantCount || undefined,
        unreadCount: chat.unreadCount || 0,
        lastMessageBody: chat.lastMessage?.body || undefined,
        lastMessageFromMe: chat.lastMessage?.fromMe,
        lastMessageTimestamp: chat.lastMessage?.timestamp || undefined,
        lastMessageType: chat.lastMessage?.type || undefined,
        lastMessageTypeLabel: chat.lastMessage?.typeLabel || undefined,
        lastMessageSenderName: chat.lastMessage?.senderName || undefined,
        timestamp: chat.timestamp || Date.now() / 1000,
      });
    } catch (e) {
      console.error("Error upserting chat:", e.message);
    }
  },

  // Batch save chats
  async batchUpsert(accountId, chats) {
    if (!api) return;
    try {
      // Split into batches of 50 to avoid hitting limits
      const batchSize = 50;
      for (let i = 0; i < chats.length; i += batchSize) {
        const batch = chats.slice(i, i + batchSize).map(chat => cleanNullValues({
          chatId: chat.id,
          name: chat.name || "Unknown",
          phone: chat.phone,
          profilePic: chat.profilePic,
          isGroup: chat.isGroup || false,
          participantCount: chat.participantCount,
          unreadCount: chat.unreadCount || 0,
          lastMessageBody: chat.lastMessage?.body,
          lastMessageFromMe: chat.lastMessage?.fromMe,
          lastMessageTimestamp: chat.lastMessage?.timestamp,
          lastMessageType: chat.lastMessage?.type,
          lastMessageTypeLabel: chat.lastMessage?.typeLabel,
          lastMessageSenderName: chat.lastMessage?.senderName,
          timestamp: chat.timestamp || Date.now() / 1000,
        }));
        
        await convex.mutation(api.chats.batchUpsertChats, { accountId, chats: batch });
      }
    } catch (e) {
      console.error("Error batch upserting chats:", e.message);
    }
  },

  // Clear all chats for an account
  async clearAccount(accountId) {
    if (!api) return;
    try {
      await convex.mutation(api.chats.clearAccountChats, { accountId });
    } catch (e) {
      console.error("Error clearing account chats:", e.message);
    }
  },
};

/**
 * Sync Status Management
 */
const syncStatusDb = {
  // Get sync status
  async get(accountId) {
    if (!api) return null;
    try {
      return await convex.query(api.syncStatus.getByAccountId, { accountId });
    } catch (e) {
      console.error("Error fetching sync status:", e.message);
      return null;
    }
  },

  // Update sync status (general update)
  async update(accountId, data) {
    if (!api) return;
    try {
      await convex.mutation(api.syncStatus.update, { 
        accountId,
        status: data.status || "syncing",
        progress: data.progress || 0,
        totalChats: data.totalChats || 0,
        syncedChats: data.syncedChats || 0,
        currentChatName: data.currentChatName,
        message: data.message || "",
        error: data.error,
      });
    } catch (e) {
      console.error("Error updating sync status:", e.message);
    }
  },

  // Start sync
  async startSync(accountId, totalChats) {
    if (!api) return;
    try {
      await convex.mutation(api.syncStatus.startSync, { accountId, totalChats });
    } catch (e) {
      console.error("Error starting sync:", e.message);
    }
  },

  // Update progress
  async updateProgress(accountId, syncedChats, totalChats, currentChatName) {
    if (!api) return;
    try {
      await convex.mutation(api.syncStatus.updateProgress, { 
        accountId, 
        syncedChats, 
        totalChats,
        currentChatName,
      });
    } catch (e) {
      console.error("Error updating sync progress:", e.message);
    }
  },

  // Complete sync
  async complete(accountId, totalChats) {
    if (!api) return;
    try {
      await convex.mutation(api.syncStatus.completeSync, { accountId, totalChats });
    } catch (e) {
      console.error("Error completing sync:", e.message);
    }
  },

  // Fail sync
  async fail(accountId, error) {
    if (!api) return;
    try {
      await convex.mutation(api.syncStatus.failSync, { accountId, error });
    } catch (e) {
      console.error("Error failing sync:", e.message);
    }
  },

  // Reset sync status
  async reset(accountId) {
    if (!api) return;
    try {
      await convex.mutation(api.syncStatus.reset, { accountId });
    } catch (e) {
      console.error("Error resetting sync:", e.message);
    }
  },
};

/**
 * Connection Events Logging
 */
const eventsDb = {
  // Log an event
  async log(accountId, event, details) {
    if (!api) return;
    try {
      await convex.mutation(api.connectionEvents.log, { accountId, event, details });
    } catch (e) {
      console.error("Error logging event:", e.message);
    }
  },

  // Get recent events
  async getRecent(accountId, limit = 50) {
    if (!api) return [];
    try {
      return await convex.query(api.connectionEvents.getRecent, { accountId, limit });
    } catch (e) {
      console.error("Error fetching events:", e.message);
      return [];
    }
  },
};

/**
 * Migration utility - sync existing data to Convex
 */
const migration = {
  // Migrate accounts from JSON file to Convex
  async migrateAccounts(accounts) {
    console.log("Migrating accounts to Convex...");
    for (const account of accounts) {
      try {
        // Check if account already exists
        const existing = await accountsDb.getById(account.id);
        if (!existing) {
          await accountsDb.create({
            accountId: account.id,
            name: account.name,
            phone: account.phone,
            isActive: account.isActive,
          });
          console.log(`Migrated account: ${account.name}`);
        } else {
          console.log(`Account already exists: ${account.name}`);
        }
      } catch (e) {
        console.error(`Error migrating account ${account.name}:`, e.message);
      }
    }
    console.log("Account migration complete!");
  },

  // Migrate cached chats to Convex
  async migrateChats(accountId, chats) {
    console.log(`Migrating ${chats.length} chats for account ${accountId}...`);
    try {
      await chatsDb.batchUpsert(accountId, chats);
      console.log("Chat migration complete!");
    } catch (e) {
      console.error("Error migrating chats:", e.message);
    }
  },
};

module.exports = {
  convex,
  accountsDb,
  sessionsDb,
  chatsDb,
  syncStatusDb,
  eventsDb,
  migration,
  isConvexReady: () => api !== null,
};
