const { createServer } = require("http");
const { parse } = require("url");
const next = require("next");
const { Server } = require("socket.io");
const { Client, LocalAuth } = require("whatsapp-web.js");
const fs = require("fs");
const path = require("path");

// Load environment variables from .env.local
require('dotenv').config({ path: path.join(__dirname, '.env.local') });

// Convex Integration
const { 
  accountsDb, 
  sessionsDb, 
  chatsDb, 
  syncStatusDb, 
  eventsDb, 
  migration,
  isConvexReady 
} = require("./convex-integration");

const dev = process.env.NODE_ENV !== "production";
const hostname = "localhost";
const port = process.env.PORT || 3000;

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

// In-memory store for chats PER ACCOUNT
const accountChats = new Map(); // accountId -> chats[]
let isReady = false;

// Chats storage directory
const CHATS_DIR = path.join(__dirname, ".chats_cache");

// Ensure chats directory exists
const ensureChatsDir = () => {
  if (!fs.existsSync(CHATS_DIR)) {
    fs.mkdirSync(CHATS_DIR, { recursive: true });
  }
};

// Load chats from disk for an account
const loadChatsFromDisk = (accountId) => {
  try {
    ensureChatsDir();
    const filePath = path.join(CHATS_DIR, `${accountId}.json`);
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, "utf8");
      const parsed = JSON.parse(data);
      console.log(`Loaded ${parsed.chats?.length || 0} cached chats for account ${accountId}`);
      return parsed.chats || [];
    }
  } catch (e) {
    console.error(`Error loading cached chats for ${accountId}:`, e.message);
  }
  return [];
};

// Save chats to disk for an account
const saveChats = (accountId, chats) => {
  try {
    ensureChatsDir();
    const filePath = path.join(CHATS_DIR, `${accountId}.json`);
    const data = {
      accountId,
      savedAt: new Date().toISOString(),
      chats: chats
    };
    fs.writeFileSync(filePath, JSON.stringify(data), "utf8");
    console.log(`Saved ${chats.length} chats to cache for account ${accountId}`);
  } catch (e) {
    console.error(`Error saving chats for ${accountId}:`, e.message);
  }
};

// Helper to get current account chats (from memory, Convex, or disk)
const getCurrentChats = async () => {
  if (!currentAccountId) return [];
  
  // Try memory first
  let chats = accountChats.get(currentAccountId);
  
  // If not in memory, try Convex
  if ((!chats || chats.length === 0) && isConvexReady()) {
    try {
      chats = await chatsDb.getByAccountId(currentAccountId);
      if (chats && chats.length > 0) {
        accountChats.set(currentAccountId, chats);
        console.log(`Loaded ${chats.length} chats from Convex for account ${currentAccountId}`);
        return chats;
      }
    } catch (e) {
      console.error("Error loading chats from Convex:", e.message);
    }
  }
  
  // Fallback to disk
  if (!chats || chats.length === 0) {
    chats = loadChatsFromDisk(currentAccountId);
    if (chats.length > 0) {
      accountChats.set(currentAccountId, chats);
      // Migrate to Convex if available
      if (isConvexReady()) {
        chatsDb.batchUpsert(currentAccountId, chats).catch(e => 
          console.error("Error migrating chats to Convex:", e.message)
        );
      }
    }
  }
  
  return chats || [];
};

// Sync version for places that can't use async
const getCurrentChatsSync = () => {
  if (!currentAccountId) return [];
  let chats = accountChats.get(currentAccountId);
  if (!chats || chats.length === 0) {
    chats = loadChatsFromDisk(currentAccountId);
    if (chats.length > 0) {
      accountChats.set(currentAccountId, chats);
    }
  }
  return chats || [];
};

// Helper to set current account chats (memory, disk, and Convex)
const setCurrentChats = (chats) => {
  if (!currentAccountId) return;
  accountChats.set(currentAccountId, chats);
  // Save to disk for persistence
  saveChats(currentAccountId, chats);
  // Save to Convex for cloud sync
  if (isConvexReady()) {
    chatsDb.batchUpsert(currentAccountId, chats).catch(e => 
      console.error("Error saving chats to Convex:", e.message)
    );
  }
};

// Accounts management
const ACCOUNTS_FILE = path.join(__dirname, "accounts.json");
let currentAccountId = null;

// Load accounts from file
const loadAccounts = () => {
  try {
    if (fs.existsSync(ACCOUNTS_FILE)) {
      const data = fs.readFileSync(ACCOUNTS_FILE, "utf8");
      const parsed = JSON.parse(data);
      // If array is not empty, return it
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (e) {
    console.error("Error loading accounts:", e.message);
  }
  // Return default account if file doesn't exist, is empty, or has error
  const defaultAccount = {
    id: `account_${Date.now()}`,
    name: "حساب 1",
    phone: null,
    isActive: true
  };
  saveAccounts([defaultAccount]);
  return [defaultAccount];
};

// Save accounts to file
const saveAccounts = (accounts) => {
  try {
    fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(accounts, null, 2), "utf8");
    console.log("Accounts saved successfully");
  } catch (e) {
    console.error("Error saving accounts:", e.message);
  }
};

// Initialize accounts
let accounts = loadAccounts();
// Set current account to the active one or first
currentAccountId = accounts.find(a => a.isActive)?.id || accounts[0]?.id;

// Migrate accounts to Convex on startup (async, non-blocking)
(async () => {
  if (isConvexReady() && accounts.length > 0) {
    console.log("Migrating accounts to Convex...");
    await migration.migrateAccounts(accounts);
  }
})().catch(e => console.error("Migration error:", e.message));

// Find Chromium executable path
const getChromiumPath = () => {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    return process.env.PUPPETEER_EXECUTABLE_PATH;
  }
  const os = require('os');
  
  // Windows paths
  if (os.platform() === 'win32') {
    const winPaths = [
      path.join(process.env.PROGRAMFILES || 'C:\\Program Files', 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)', 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(process.env.PROGRAMFILES || 'C:\\Program Files', 'Chromium', 'Application', 'chrome.exe'),
    ];
    for (const p of winPaths) {
      if (p && fs.existsSync(p)) return p;
    }
  } else {
    // Linux/Mac paths
    const paths = [
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
    ];
    for (const p of paths) {
      if (fs.existsSync(p)) return p;
    }
  }
  
  return undefined; // Use bundled Chromium
};

// Cleanup function for orphaned browser sessions
const cleanupOrphanedBrowser = async (accountId) => {
  const { exec } = require('child_process');
  const sessionPath = path.join(__dirname, '.wwebjs_auth', `session-${accountId}`);
  const lockFile = path.join(sessionPath, 'SingletonLock');
  
  console.log(`Cleaning up browser for account: ${accountId}`);
  
  // Remove lock files if they exist
  const lockFiles = ['SingletonLock', 'SingletonCookie', 'SingletonSocket'];
  for (const file of lockFiles) {
    const filePath = path.join(sessionPath, file);
    if (fs.existsSync(filePath)) {
      try {
        fs.rmSync(filePath, { recursive: true, force: true });
        console.log(`Removed ${file} for ${accountId}`);
      } catch (e) {
        console.log(`Could not remove ${file}: ${e.message}`);
      }
    }
  }
  
  // Kill Chrome processes using this session
  return new Promise((resolve) => {
    if (process.platform === 'win32') {
      // Windows
      const userDataDir = sessionPath.replace(/\\/g, '\\\\');
      exec(`wmic process where "commandline like '%${userDataDir}%' and name='chrome.exe'" call terminate`, (error) => {
        if (!error) {
          console.log(`Terminated orphaned Chrome processes for ${accountId}`);
        }
        setTimeout(resolve, 1500);
      });
    } else {
      // Linux/Mac - more aggressive cleanup
      // Kill ANY chromium processes that might be orphaned
      const commands = [
        `pkill -9 -f "chromium.*${accountId}" 2>/dev/null || true`,
        `pkill -9 -f "chrome.*${accountId}" 2>/dev/null || true`,
        `pkill -9 -f "session-${accountId}" 2>/dev/null || true`,
        `rm -rf "${sessionPath}/SingletonLock" "${sessionPath}/SingletonCookie" "${sessionPath}/SingletonSocket" 2>/dev/null || true`
      ];
      
      exec(commands.join(' && '), () => {
        console.log(`Cleanup completed for ${accountId} (Linux)`);
        setTimeout(resolve, 1500);
      });
    }
  });
};

// Stop all running WhatsApp clients
const stopAllClients = async () => {
  console.log("Stopping all running WhatsApp clients...");
  const promises = [];
  
  for (const [accountId, client] of whatsappClients.entries()) {
    promises.push((async () => {
      try {
        console.log(`Stopping client for ${accountId}...`);
        await client.destroy();
      } catch (e) {
        console.log(`Error stopping client ${accountId}: ${e.message}`);
      }
      await cleanupOrphanedBrowser(accountId);
      whatsappClients.delete(accountId);
      clientReadyStates.delete(accountId);
    })());
  }
  
  await Promise.all(promises);
  console.log("All clients stopped");
};

// Store for WhatsApp clients - each account has its own client
const whatsappClients = new Map();
// Track ready state for each client
const clientReadyStates = new Map();


// Create WhatsApp client for a specific account
const createWhatsAppClient = (accountId) => {
  console.log(`Creating WhatsApp client for account: ${accountId}`);
  
  const client = new Client({
    authStrategy: new LocalAuth({ clientId: accountId }),
    puppeteer: {
      headless: true,
      executablePath: getChromiumPath(),
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-accelerated-2d-canvas",
        "--no-first-run",
        "--disable-gpu",
        "--disable-web-security",
        "--disable-features=IsolateOrigins,site-per-process",
        "--disable-blink-features=AutomationControlled",
        // Memory optimization flags
        "--single-process",
        "--disable-extensions",
        "--disable-plugins",
        "--disable-translate",
        "--disable-sync",
        "--disable-background-networking",
        "--disable-default-apps",
        "--disable-infobars",
        "--disable-notifications",
        "--disable-popup-blocking",
        "--disable-hang-monitor",
        "--disable-prompt-on-repost",
        "--disable-client-side-phishing-detection",
        "--disable-component-update",
        "--disable-domain-reliability",
        "--disable-print-preview",
        "--disable-speech-api",
        "--no-zygote",
        "--memory-pressure-off",
        "--js-flags=--max-old-space-size=256",
      ],
      timeout: 0,
      ignoreHTTPSErrors: true,
      protocolTimeout: 3600000,
    },
  });
  
  return client;
};

// Get current WhatsApp client
const getCurrentClient = () => {
  if (!currentAccountId) return null;
  return whatsappClients.get(currentAccountId);
};

// Current client reference (for compatibility)
let whatsappClient = null;


app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    const parsedUrl = parse(req.url, true);
    handle(req, res, parsedUrl);
  });

  const io = new Server(httpServer, {
    cors: {
      origin: [
        "https://eng-whats-git-main-engelsayedebaids-projects.vercel.app",
        "https://eng-whats-production-fb3e.up.railway.app",
        "http://localhost:3000",
        "http://localhost:8080",
      ],
      methods: ["GET", "POST", "OPTIONS"],
      credentials: true,
      allowedHeaders: ["Content-Type", "Authorization"],
    },
    // Allow both transports for maximum compatibility
    transports: ['polling', 'websocket'],
    // Allow upgrade from polling to websocket
    allowUpgrades: true,
    // Increase ping timeout for slow connections
    pingTimeout: 60000,
    pingInterval: 25000,
    // Connection timeout
    connectTimeout: 45000,
    // Max HTTP buffer size for large messages
    maxHttpBufferSize: 1e8,
    // Path configuration
    path: '/socket.io/',
  });

  // Setup WhatsApp client events
  const setupClientEvents = (client, accountId) => {
    client.on("qr", (qr) => {
      console.log(`QR Code received for account: ${accountId}`);
      if (currentAccountId === accountId) {
        io.emit("qr", qr);
      }
      // Log QR event to Convex
      if (isConvexReady()) {
        eventsDb.log(accountId, "qr_generated", "QR code generated for scanning").catch(() => {});
      }
    });

    client.on("ready", async () => {
      console.log(`WhatsApp client is ready for account: ${accountId}!`);
      // Mark this client as ready
      clientReadyStates.set(accountId, true);
      
      if (currentAccountId === accountId) {
        isReady = true;
        // Update account phone number
        try {
          const info = client.info;
          if (info && info.wid) {
            const phoneNumber = info.wid.user;
            const accountIndex = accounts.findIndex(a => a.id === accountId);
            if (accountIndex !== -1) {
              accounts[accountIndex].phone = phoneNumber;
              saveAccounts(accounts);
              io.emit("accounts", accounts);
              
              // Sync account to Convex
              if (isConvexReady()) {
                accountsDb.update(accountId, { phone: phoneNumber }).catch(() => {});
              }
            }
          }
        } catch (e) {
          console.error("Error getting client info:", e.message);
        }
        io.emit("status", { isReady: true });
        io.emit("ready");
        
        // Update session state in Convex
        if (isConvexReady()) {
          sessionsDb.setReady(accountId, true).catch(() => {});
          sessionsDb.setAuthenticated(accountId, true).catch(() => {});
          eventsDb.log(accountId, "ready", "WhatsApp client is ready").catch(() => {});
        }
        
        // Send cached chats immediately if available
        const cachedChats = await getCurrentChats();
        if (cachedChats.length > 0) {
          console.log(`Sending ${cachedChats.length} cached chats on ready`);
          io.emit("chats", cachedChats);
        }
      }
    });


    client.on("authenticated", () => {
      console.log(`WhatsApp client authenticated for account: ${accountId}`);
      // Sync authentication state to Convex
      if (isConvexReady()) {
        sessionsDb.setAuthenticated(accountId, true).catch(() => {});
        eventsDb.log(accountId, "authenticated", "WhatsApp client authenticated").catch(() => {});
      }
    });

    client.on("auth_failure", (msg) => {
      console.error(`Auth failure for account ${accountId}:`, msg);
      if (currentAccountId === accountId) {
        io.emit("authFailure", { message: msg });
      }
      // Log auth failure to Convex
      if (isConvexReady()) {
        sessionsDb.setAuthenticated(accountId, false).catch(() => {});
        eventsDb.log(accountId, "auth_failure", msg).catch(() => {});
      }
    });

    client.on("disconnected", (reason) => {
      console.log(`WhatsApp disconnected for account ${accountId}:`, reason);
      // Mark this client as not ready
      clientReadyStates.set(accountId, false);
      
      if (currentAccountId === accountId) {
        isReady = false;
        io.emit("status", { isReady: false });
        io.emit("disconnected", { reason });
      }
      
      // Update session state in Convex
      if (isConvexReady()) {
        sessionsDb.setDisconnected(accountId, reason).catch(() => {});
        eventsDb.log(accountId, "disconnected", reason).catch(() => {});
      }
    });

    client.on("message", async (message) => {
      // Skip if not current account or client not ready
      if (currentAccountId !== accountId) return;
      if (!clientReadyStates.get(accountId)) return;
      
      console.log("New message received from:", message.from);
      
      let senderName = "مجهول";
      let senderPhone = message.from.split("@")[0];
      let chatName = senderPhone;
      let isGroup = message.from.includes("@g.us");
      
      try {
        // Check again if client is still ready before async operations
        if (!clientReadyStates.get(accountId)) return;
        
        const contact = await message.getContact();
        senderName = contact.pushname || contact.name || senderPhone;
        
        // Try to get chat info for chat name
        try {
          if (!clientReadyStates.get(accountId)) return;
          
          const chat = await message.getChat();
          chatName = chat.name || senderName;
          isGroup = chat.isGroup || false;
          
          // Update chat in memory and Convex with new message
          const chatId = message.from;
          const existingChats = accountChats.get(currentAccountId) || [];
          const chatIndex = existingChats.findIndex(c => c.id === chatId);
          
          if (chatIndex !== -1) {
            // Update existing chat with new message info
            existingChats[chatIndex].lastMessage = {
              body: message.body || "رسالة جديدة",
              fromMe: message.fromMe,
              timestamp: message.timestamp,
              type: message.type,
              senderName: senderName,
            };
            existingChats[chatIndex].timestamp = message.timestamp;
            existingChats[chatIndex].unreadCount = (existingChats[chatIndex].unreadCount || 0) + (message.fromMe ? 0 : 1);
            
            // Update Convex in background
            if (isConvexReady()) {
              chatsDb.upsertChat(currentAccountId, existingChats[chatIndex]).catch(() => {});
            }
          }
        } catch (e) {
          // Use sender name as chat name if chat fetch fails (ignore context destroyed errors)
          if (!e.message?.includes('context was destroyed')) {
            chatName = senderName;
          }
        }
      } catch (e) {
        // Silently ignore context destroyed errors
      }
      
      const typeLabels = {
        chat: "نص",
        image: "صورة 📷",
        video: "فيديو 🎥",
        audio: "صوت 🎵",
        ptt: "رسالة صوتية 🎤",
        document: "مستند 📄",
        sticker: "ملصق",
        location: "موقع 📍",
        contact: "جهة اتصال 👤",
        poll_creation: "استطلاع 📊",
      };
      
      io.emit("newMessage", {
        id: message.id._serialized,
        body: message.body || typeLabels[message.type] || "",
        fromMe: message.fromMe,
        from: message.from,
        chatId: message.from,
        timestamp: message.timestamp,
        type: message.type,
        typeLabel: typeLabels[message.type] || "نص",
        senderName: senderName,
        senderPhone: senderPhone,
        chatName: chatName,
        isGroup: isGroup,
      });
    });

    client.on("message_create", async (message) => {
      if (currentAccountId !== accountId) return;
      
      if (message.fromMe) {
        console.log("Message sent to:", message.to);
        
        let chatName = message.to.split("@")[0];
        let isGroup = message.to.includes("@g.us");
        
        // Try to get chat info
        try {
          const chat = await message.getChat();
          chatName = chat.name || chatName;
          isGroup = chat.isGroup || false;
        } catch (e) {
          // Use default values if chat fetch fails
        }
        
        const typeLabels = {
          chat: "نص",
          image: "صورة 📷",
          video: "فيديو 🎥",
          audio: "صوت 🎵",
          ptt: "رسالة صوتية 🎤",
          document: "مستند 📄",
          sticker: "ملصق",
          location: "موقع 📍",
          contact: "جهة اتصال 👤",
          poll_creation: "استطلاع 📊",
        };
        
        io.emit("newMessage", {
          id: message.id._serialized,
          body: message.body || typeLabels[message.type] || "",
          fromMe: true,
          from: message.to,
          chatId: message.to,
          timestamp: message.timestamp,
          type: message.type,
          typeLabel: typeLabels[message.type] || "نص",
          senderName: "أنا",
          senderPhone: "",
          chatName: chatName,
          isGroup: isGroup,
        });
      }
    });

    client.on("error", (error) => {
      console.error(`WhatsApp client error for account ${accountId}:`, error);
      if (error.message && error.message.includes('Target closed')) {
        console.log('Browser target closed, attempting to reinitialize...');
        setTimeout(() => {
          if (currentAccountId === accountId && !isReady) {
            console.log('Reinitializing WhatsApp client...');
            client.initialize().catch(err => {
              console.error('Failed to reinitialize:', err.message);
            });
          }
        }, 5000);
      }
    });
  };

  // Initialize or switch to account
  const initializeAccount = async (accountId, retryCount = 0) => {
    console.log(`Initializing account: ${accountId}${retryCount > 0 ? ` (retry ${retryCount})` : ''}`);
    
    isReady = false;
    io.emit("status", { isReady: false });
    io.emit("qrCleared");
    
    // Check Convex for session state first
    if (isConvexReady()) {
      try {
        const session = await sessionsDb.getByAccountId(accountId);
        if (session && session.isReady) {
          console.log(`Session found in Convex for ${accountId}, checking client state...`);
        }
        
        // Load cached chats from Convex
        const cachedChats = await chatsDb.getByAccountId(accountId);
        if (cachedChats && cachedChats.length > 0) {
          console.log(`Loaded ${cachedChats.length} cached chats from Convex`);
          accountChats.set(accountId, cachedChats);
          io.emit("chats", cachedChats);
        }
      } catch (e) {
        console.error("Error checking Convex session:", e.message);
      }
    }
    
    let client = whatsappClients.get(accountId);
    
    // Check if client already exists and is ready
    if (client && clientReadyStates.get(accountId)) {
      console.log(`Client already ready for ${accountId}, reusing...`);
      isReady = true;
      io.emit("status", { isReady: true });
      io.emit("ready");
      whatsappClient = client;
      
      // Send cached chats
      const chats = await getCurrentChats();
      if (chats.length > 0) {
        io.emit("chats", chats);
      }
      return;
    }
    
    // Stop ALL other clients first (we can only run one browser at a time)
    for (const [otherAccountId, otherClient] of whatsappClients.entries()) {
      if (otherAccountId !== accountId) {
        console.log(`Stopping other client: ${otherAccountId}`);
        try {
          await otherClient.destroy();
        } catch (e) {
          console.log(`Error stopping other client: ${e.message}`);
        }
        await cleanupOrphanedBrowser(otherAccountId);
        whatsappClients.delete(otherAccountId);
        clientReadyStates.delete(otherAccountId);
      }
    }
    
    // If there's an existing client for this account that's not ready, destroy it first
    if (client) {
      try {
        console.log(`Destroying existing non-ready client for ${accountId}...`);
        await client.destroy();
      } catch (e) {
        console.log("Error destroying client (may already be closed):", e.message);
      }
      await cleanupOrphanedBrowser(accountId);
      whatsappClients.delete(accountId);
      clientReadyStates.delete(accountId);
    }
    
    // Wait for all processes to fully terminate
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    // Create new client
    client = createWhatsAppClient(accountId);
    whatsappClients.set(accountId, client);
    setupClientEvents(client, accountId);
    whatsappClient = client;
    
    // Log initialization event to Convex
    if (isConvexReady()) {
      eventsDb.log(accountId, "initializing", "Starting WhatsApp client initialization").catch(() => {});
    }
    
    try {
      await client.initialize();
    } catch (error) {
      console.error(`Failed to initialize account ${accountId}:`, error.message);
      
      // If browser is already running, clean up orphaned processes and retry
      if (retryCount < 2 && error.message.includes("browser is already running")) {
        console.log("Browser already running error detected, cleaning up orphaned processes...");
        
        // Clean up the failed client from our maps
        whatsappClients.delete(accountId);
        clientReadyStates.delete(accountId);
        
        // Clean up orphaned browser processes
        await cleanupOrphanedBrowser(accountId);
        
        // Wait for cleanup to complete
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Retry with fresh client
        console.log("Retrying initialization after cleanup...");
        return initializeAccount(accountId, retryCount + 1);
      }
      
      // If it's a Protocol/Navigation error and we haven't retried enough, try again
      const isRecoverableError = 
        error.message.includes("Protocol error") || 
        error.message.includes("Session closed") || 
        error.message.includes("frame was detached") ||
        error.message.includes("Navigating frame") ||
        error.message.includes("Navigation timeout") ||
        error.message.includes("Execution context");
        
      if (retryCount < 2 && isRecoverableError) {
        console.log(`Recoverable error detected: ${error.message.substring(0, 50)}...`);
        console.log("Cleaning up and retrying...");
        
        // Clean up the failed client
        try {
          await client.destroy();
        } catch (e) {
          // Ignore cleanup errors
        }
        whatsappClients.delete(accountId);
        clientReadyStates.delete(accountId);
        
        // Clean up any orphaned browser
        await cleanupOrphanedBrowser(accountId);
        
        // Wait a bit before retry (longer for each retry)
        await new Promise(resolve => setTimeout(resolve, 3000 * (retryCount + 1)));
        
        // Retry
        return initializeAccount(accountId, retryCount + 1);
      }
      
      // Log error to Convex
      if (isConvexReady()) {
        eventsDb.log(accountId, "error", `Initialization failed: ${error.message}`).catch(() => {});
      }
    }
  };

  // Socket.io connection
  io.on("connection", (socket) => {
    console.log("Client connected:", socket.id);

    // Send current status
    socket.emit("status", { isReady });


    // Track getChats in progress to prevent multiple calls
    let isGettingChats = false;
    let lastGetChatsTime = 0;
    const GET_CHATS_THROTTLE = 10000; // 10 seconds between getChats calls

    // Request to fetch chats
    socket.on("getChats", async () => {
      if (!isReady) {
        socket.emit("chatsError", { message: "WhatsApp not ready" });
        return;
      }

      // Check throttle
      const now = Date.now();
      if (now - lastGetChatsTime < GET_CHATS_THROTTLE) {
        console.log("getChats throttled - sending cached data");
        const cachedChats = getCurrentChats();
        if (cachedChats.length > 0) {
          socket.emit("chats", cachedChats);
        }
        return;
      }

      // Check if already in progress
      if (isGettingChats) {
        console.log("getChats already in progress - sending cached data");
        const cachedChats = getCurrentChats();
        if (cachedChats.length > 0) {
          socket.emit("chats", cachedChats);
        }
        return;
      }

      isGettingChats = true;
      lastGetChatsTime = now;

      // Send cached chats immediately while fetching new ones
      const cachedChats = getCurrentChats();
      if (cachedChats.length > 0) {
        console.log(`Sending ${cachedChats.length} cached chats first`);
        socket.emit("chats", cachedChats);
      }

      // Helper to delay
      const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
      
      // Retry function with better error handling
      const fetchWithRetry = async (retries = 3) => {
        for (let i = 0; i < retries; i++) {
          try {
            // Check if client and page are still available
            if (!whatsappClient || !whatsappClient.pupPage) {
              console.log("Client or page not available, waiting...");
              await delay(2000);
              continue;
            }
            
            // Check if client info is available
            const info = whatsappClient.info;
            if (!info) {
              console.log("Client info not available, waiting...");
              await delay(2000);
              continue;
            }
            
            console.log("Connected as:", info.pushname);
            
            // Wait a bit before fetching to ensure WhatsApp is ready
            if (i === 0) await delay(1000);
            
            const allChats = await whatsappClient.getChats();
            console.log(`Found ${allChats.length} chats`);
            return allChats;
          } catch (error) {
            console.error(`Attempt ${i + 1} failed:`, error.message);
            
            // If it's a detached frame error, the page is gone - don't retry, use cache
            if (error.message.includes('detached Frame') || error.message.includes('Target closed')) {
              console.log("Browser page detached, returning cached data");
              return null; // Signal to use cached data
            }
            
            if (i < retries - 1) {
              await delay(2000 * (i + 1)); // Exponential backoff
            } else {
              throw error;
            }
          }
        }
        return null;
      };

      try {
        console.log("Fetching chats...");
        
        const allChats = await fetchWithRetry(3);
        
        // If fetch failed, use cached data
        if (!allChats) {
          console.log("Using cached chats due to fetch failure");
          const cached = await getCurrentChats();
          if (cached.length > 0) {
            socket.emit("chats", cached);
            return;
          }
          socket.emit("chatsError", { message: "لا يمكن جلب المحادثات - حاول مرة أخرى" });
          return;
        }
        
        console.log(`Processing ${allChats.length} chats...`);
        
        const processedChats = [];
        
        for (const chat of allChats) {
          try {
            // Get profile picture
            let profilePic = null;
            try {
              profilePic = await chat.getContact().then(c => c.getProfilePicUrl());
            } catch (e) {
              // Ignore profile pic errors
            }
            
            // Extract phone number
            const phoneNumber = chat.id._serialized.split("@")[0];
            
            // Get group participants if it's a group
            let participants = [];
            if (chat.isGroup) {
              try {
                const groupChat = chat;
                if (groupChat.participants) {
                  participants = groupChat.participants.map(p => ({
                    id: p.id._serialized,
                    name: p.id.user,
                    isAdmin: p.isAdmin || false,
                    isSuperAdmin: p.isSuperAdmin || false,
                  }));
                }
              } catch (e) {
                // Ignore participant errors
              }
            }
            
            const chatData = {
              id: chat.id._serialized,
              name: chat.name || chat.id.user || phoneNumber || "Unknown",
              phone: phoneNumber,
              profilePic: profilePic,
              isGroup: chat.isGroup || false,
              participants: participants,
              participantCount: participants.length,
              unreadCount: chat.unreadCount || 0,
              lastMessage: null,
              timestamp: chat.timestamp || Date.now() / 1000,
            };
            
            // Try to get last message safely with sender info and type
            if (chat.lastMessage) {
              const msg = chat.lastMessage;
              let senderName = "أنا";
              
              if (!msg.fromMe && chat.isGroup) {
                try {
                  const senderId = msg.author || msg.from;
                  senderName = senderId ? senderId.split("@")[0] : "مجهول";
                } catch (e) {
                  senderName = "مجهول";
                }
              } else if (!msg.fromMe) {
                senderName = chat.name || phoneNumber;
              }
              
              // Get message type label
              const typeLabels = {
                chat: "نص",
                image: "صورة 📷",
                video: "فيديو 🎥",
                audio: "صوت 🎵",
                ptt: "رسالة صوتية 🎤",
                document: "مستند 📄",
                sticker: "ملصق",
                location: "موقع 📍",
                contact: "جهة اتصال 👤",
                poll_creation: "استطلاع 📊",
              };
              
              chatData.lastMessage = {
                body: msg.body || typeLabels[msg.type] || "",
                fromMe: msg.fromMe || false,
                timestamp: msg.timestamp || Date.now() / 1000,
                type: msg.type || "chat",
                typeLabel: typeLabels[msg.type] || "نص",
                senderName: senderName,
              };
            }
            
            processedChats.push(chatData);
          } catch (chatError) {
            console.error("Error processing single chat:", chatError.message);
          }
        }
        
        setCurrentChats(processedChats);
        console.log(`Processed ${getCurrentChats().length} chats successfully`);
        socket.emit("chats", getCurrentChats());
        
      } catch (error) {
        console.error("Error fetching chats:", error.message, error.stack);
        socket.emit("chatsError", { message: error.message || "Unknown error" });
      } finally {
        isGettingChats = false;
      }
    });

    // Messages cache for fallback
    const messagesCache = new Map();
    
    // Helper: Check if client is truly ready
    const isClientReady = () => {
      return isReady && 
             whatsappClient && 
             whatsappClient.pupPage && 
             clientReadyStates.get(currentAccountId);
    };
    
    // Helper: Wait with promise
    const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));
    
    // Helper: Safe operation with timeout
    const safeOperation = async (operation, timeoutMs = 15000, fallback = null) => {
      try {
        return await Promise.race([
          operation(),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Operation timeout')), timeoutMs)
          )
        ]);
      } catch (e) {
        return fallback;
      }
    };
    
    // Helper: Format single message safely
    const formatMessageSafe = async (msg, chat, skipMedia = false) => {
      try {
        const messageData = {
          id: msg?.id?._serialized || msg?.id || `temp_${Date.now()}_${Math.random()}`,
          body: msg?.body ?? '',
          fromMe: msg?.fromMe ?? false,
          timestamp: msg?.timestamp ?? Math.floor(Date.now() / 1000),
          type: msg?.type ?? 'chat',
          hasMedia: msg?.hasMedia ?? false,
          mediaUrl: null,
          mimetype: null,
          filename: null,
          duration: null,
          senderName: null,
          mediaError: false,
        };
        
        // Get sender name for group messages
        if (!messageData.fromMe && chat?.isGroup && msg?.author) {
          messageData.senderName = await safeOperation(
            async () => {
              const contact = await msg.getContact();
              return contact?.pushname || contact?.name || msg.author?.split("@")[0] || "مجهول";
            },
            5000,
            msg.author?.split("@")[0] || "مجهول"
          );
        }
        
        // Fetch media if available (with multiple retries)
        if (messageData.hasMedia && !skipMedia && isClientReady()) {
          for (let mediaAttempt = 0; mediaAttempt < 3; mediaAttempt++) {
            const media = await safeOperation(
              () => msg.downloadMedia(),
              10000,
              null
            );
            if (media?.data) {
              messageData.mediaUrl = `data:${media.mimetype || 'application/octet-stream'};base64,${media.data}`;
              messageData.mimetype = media.mimetype;
              messageData.filename = media.filename;
              break;
            }
            if (mediaAttempt < 2) await wait(500);
          }
          if (!messageData.mediaUrl) {
            messageData.mediaError = true;
          }
        } else if (messageData.hasMedia) {
          messageData.mediaError = true;
        }
        
        // Get duration for audio/video
        if (msg?.type === "ptt" || msg?.type === "audio") {
          messageData.duration = msg?.duration || null;
        }
        
        return messageData;
      } catch (e) {
        // Return minimal message data on error
        return {
          id: `error_${Date.now()}_${Math.random()}`,
          body: msg?.body ?? '',
          fromMe: msg?.fromMe ?? false,
          timestamp: msg?.timestamp ?? Math.floor(Date.now() / 1000),
          type: msg?.type ?? 'chat',
          hasMedia: false,
          mediaUrl: null,
          mimetype: null,
          filename: null,
          duration: null,
          senderName: null,
          mediaError: false,
        };
      }
    };

    // Request to get messages for a specific chat (with media support) - PROFESSIONAL INFINITE RETRY
    socket.on("getMessages", async ({ chatId, limit = 50 }) => {
      const MAX_RETRIES = 100; // كثير جداً لضمان عدم الفشل
      const INITIAL_DELAY = 500;
      const MAX_DELAY = 10000;
      
      let attempt = 0;
      let lastError = null;
      let partialMessages = [];
      
      // Send loading status
      socket.emit("messagesLoading", { chatId, status: "جاري التحميل..." });
      
      while (attempt < MAX_RETRIES) {
        attempt++;
        
        // Strategy 1: Direct fetch if client is ready
        if (isClientReady()) {
          try {
            // Method A: getChatById then fetchMessages
            const chat = await safeOperation(
              () => whatsappClient.getChatById(chatId),
              20000,
              null
            );
            
            if (chat) {
              const messages = await safeOperation(
                () => chat.fetchMessages({ limit }),
                30000,
                null
              );
              
              if (messages && Array.isArray(messages) && messages.length > 0) {
                // Format messages in batches to avoid overwhelming
                const BATCH_SIZE = 10;
                const formattedMessages = [];
                
                for (let i = 0; i < messages.length; i += BATCH_SIZE) {
                  if (!isClientReady()) break; // Stop if client disconnected
                  
                  const batch = messages.slice(i, i + BATCH_SIZE);
                  const formattedBatch = await Promise.all(
                    batch.map(msg => formatMessageSafe(msg, chat, false))
                  );
                  formattedMessages.push(...formattedBatch);
                  
                  // Send progress
                  socket.emit("messagesLoading", { 
                    chatId, 
                    status: `جاري التحميل ${Math.min(i + BATCH_SIZE, messages.length)}/${messages.length}` 
                  });
                }
                
                if (formattedMessages.length > 0) {
                  // Cache successful result
                  messagesCache.set(chatId, {
                    messages: formattedMessages,
                    timestamp: Date.now()
                  });
                  
                  socket.emit("messages", { chatId, messages: formattedMessages });
                  return; // Success!
                }
              }
            }
          } catch (e) {
            lastError = e;
          }
        }
        
        // Strategy 2: Try getting from client's chats directly
        if (isClientReady() && attempt % 3 === 0) {
          try {
            const chats = await safeOperation(
              () => whatsappClient.getChats(),
              30000,
              []
            );
            
            const targetChat = chats?.find?.(c => c?.id?._serialized === chatId);
            if (targetChat) {
              const messages = await safeOperation(
                () => targetChat.fetchMessages({ limit }),
                30000,
                null
              );
              
              if (messages && Array.isArray(messages) && messages.length > 0) {
                const formattedMessages = await Promise.all(
                  messages.map(msg => formatMessageSafe(msg, targetChat, attempt > 5))
                );
                
                messagesCache.set(chatId, {
                  messages: formattedMessages,
                  timestamp: Date.now()
                });
                
                socket.emit("messages", { chatId, messages: formattedMessages });
                return; // Success!
              }
            }
          } catch (e) {
            lastError = e;
          }
        }
        
        // Strategy 3: Return cached messages if available (after several attempts)
        if (attempt >= 5) {
          const cached = messagesCache.get(chatId);
          if (cached && cached.messages && cached.messages.length > 0) {
            // Check cache age (use if less than 5 minutes old)
            if (Date.now() - cached.timestamp < 5 * 60 * 1000) {
              socket.emit("messages", { 
                chatId, 
                messages: cached.messages,
                fromCache: true 
              });
              return; // Success from cache!
            }
          }
        }
        
        // Strategy 4: Wait for client to become ready
        if (!isClientReady()) {
          socket.emit("messagesLoading", { 
            chatId, 
            status: `انتظار اتصال واتساب... (${attempt})` 
          });
          
          // Wait for client with checking
          let waitTime = 0;
          while (!isClientReady() && waitTime < 30000) {
            await wait(1000);
            waitTime += 1000;
          }
          
          if (isClientReady()) {
            continue; // Client ready, retry immediately
          }
        }
        
        // Calculate delay with exponential backoff (capped)
        const delay = Math.min(INITIAL_DELAY * Math.pow(1.5, attempt - 1), MAX_DELAY);
        
        // Emit retry status every few attempts
        if (attempt % 5 === 0) {
          socket.emit("messagesLoading", { 
            chatId, 
            status: `محاولة ${attempt}... جاري المحاولة` 
          });
        }
        
        await wait(delay);
      }
      
      // If we got here, all retries failed - try cache one last time
      const cached = messagesCache.get(chatId);
      if (cached && cached.messages && cached.messages.length > 0) {
        socket.emit("messages", { 
          chatId, 
          messages: cached.messages,
          fromCache: true,
          cacheAge: Date.now() - cached.timestamp
        });
        return;
      }
      
      // Absolute last resort: send empty with info
      socket.emit("messages", { 
        chatId, 
        messages: [],
        error: "تعذر جلب الرسائل بعد محاولات عديدة",
        retryable: true
      });
    });

    // Send message - PROFESSIONAL INFINITE RETRY
    socket.on("sendMessage", async ({ chatId, message }) => {
      if (!chatId || !message) {
        socket.emit("sendMessageError", { message: "Chat ID and message are required" });
        return;
      }

      const MAX_RETRIES = 50;
      const INITIAL_DELAY = 500;
      const MAX_DELAY = 5000;
      
      let attempt = 0;
      let sentMessage = null;
      let lastError = null;
      
      // Send status
      socket.emit("sendMessageStatus", { chatId, status: "جاري الإرسال..." });
      
      // Prepare target ID
      let targetId = chatId;
      if (chatId.includes("@lid")) {
        try {
          const chats = await getCurrentChats();
          const cachedChat = chats?.find?.(c => c?.id === chatId);
          if (cachedChat?.phone) {
            targetId = cachedChat.phone + "@c.us";
          }
        } catch (e) {
          // Use original chatId
        }
      }
      
      while (attempt < MAX_RETRIES && !sentMessage) {
        attempt++;
        
        // Wait for client to be ready
        if (!isClientReady()) {
          socket.emit("sendMessageStatus", { chatId, status: `انتظار الاتصال... (${attempt})` });
          
          let waitTime = 0;
          while (!isClientReady() && waitTime < 30000) {
            await wait(1000);
            waitTime += 1000;
          }
          
          if (!isClientReady()) {
            const delay = Math.min(INITIAL_DELAY * Math.pow(1.5, attempt - 1), MAX_DELAY);
            await wait(delay);
            continue;
          }
        }
        
        // Method 1: Direct sendMessage (simplest)
        try {
          sentMessage = await safeOperation(
            () => whatsappClient.sendMessage(targetId, message),
            20000,
            null
          );
          if (sentMessage) {
            console.log("Message sent via direct method");
            break;
          }
        } catch (e) {
          lastError = e;
        }
        
        // Method 2: Get chat first, then send
        if (!sentMessage && isClientReady()) {
          try {
            const chat = await safeOperation(
              () => whatsappClient.getChatById(targetId),
              15000,
              null
            );
            if (chat && typeof chat.sendMessage === 'function') {
              sentMessage = await safeOperation(
                () => chat.sendMessage(message),
                15000,
                null
              );
              if (sentMessage) {
                console.log("Message sent via chat.sendMessage");
                break;
              }
            }
          } catch (e) {
            lastError = e;
          }
        }
        
        // Method 3: Use pupPage directly with WWebJS injected methods
        if (!sentMessage && whatsappClient?.pupPage) {
          try {
            const result = await safeOperation(async () => {
              return await whatsappClient.pupPage.evaluate(async (to, msg) => {
                try {
                  if (window.WWebJS && window.WWebJS.sendMessage) {
                    const chatWid = window.Store.WidFactory.createWid(to);
                    await window.WWebJS.sendMessage(chatWid, msg, {});
                    return { success: true, method: 'WWebJS' };
                  }
                  
                  const chatWid = window.Store.WidFactory.createWid(to);
                  const chat = await window.Store.Chat.find(chatWid);
                  if (chat) {
                    await window.Store.SendMessage.sendMsgToChat(chat, msg);
                    return { success: true, method: 'Store' };
                  }
                  return { success: false, error: 'Chat not found' };
                } catch (err) {
                  return { success: false, error: err.message };
                }
              }, targetId, message);
            }, 15000, { success: false });
            
            if (result?.success) {
              console.log(`Message sent via pupPage (${result.method})`);
              sentMessage = { id: { _serialized: `manual_${Date.now()}` }, timestamp: Date.now() / 1000 };
              break;
            }
          } catch (e) {
            lastError = e;
          }
        }
        
        // Method 4: Try with original chatId if different
        if (!sentMessage && targetId !== chatId && isClientReady()) {
          try {
            sentMessage = await safeOperation(
              () => whatsappClient.sendMessage(chatId, message),
              15000,
              null
            );
            if (sentMessage) {
              console.log("Message sent via original chatId");
              break;
            }
          } catch (e) {
            lastError = e;
          }
        }
        
        // Update status every few attempts
        if (attempt % 5 === 0) {
          socket.emit("sendMessageStatus", { chatId, status: `محاولة ${attempt}...` });
        }
        
        // Delay before next attempt
        const delay = Math.min(INITIAL_DELAY * Math.pow(1.3, attempt - 1), MAX_DELAY);
        await wait(delay);
      }
      
      if (sentMessage) {
        console.log("Message sent successfully!");
        socket.emit("messageSent", { 
          success: true, 
          chatId,
          messageId: sentMessage?.id?._serialized || sentMessage?.id || `msg_${Date.now()}`,
          timestamp: sentMessage?.timestamp || Date.now() / 1000
        });
      } else {
        // Final failure after all retries
        socket.emit("sendMessageError", { 
          message: "فشل الإرسال - حاول مرة أخرى",
          retryable: true,
          attempts: attempt
        });
      }
    });

    // Search cache for results
    const searchResultsCache = new Map();
    
    // Search messages across all chats - PROFESSIONAL WITH RETRY
    socket.on("searchMessages", async ({ query, maxChats = 50, maxMessagesPerChat = 30 }) => {
      if (!query || query.trim().length < 2) {
        socket.emit("searchResults", { results: [], query: "" });
        return;
      }

      const queryLower = query.toLowerCase().trim();
      const cacheKey = `${queryLower}_${maxChats}_${maxMessagesPerChat}`;
      
      console.log(`Searching for: "${query}"`);
      
      socket.emit("searchProgress", { 
        status: "searching", 
        message: `جاري البحث عن "${query}"...`,
        progress: 5
      });

      // Get chats with retry
      let allChats = [];
      for (let attempt = 0; attempt < 10; attempt++) {
        if (!isClientReady()) {
          socket.emit("searchProgress", { 
            status: "searching", 
            message: `انتظار الاتصال... (${attempt + 1})`,
            progress: 5
          });
          await wait(2000);
          continue;
        }
        
        try {
          allChats = await safeOperation(
            () => whatsappClient.getChats(),
            30000,
            []
          );
          if (allChats && allChats.length > 0) break;
        } catch (e) {
          // Continue retrying
        }
        
        await wait(1000);
      }
      
      // If still no chats, use cached chats
      if (!allChats || allChats.length === 0) {
        const cachedChats = await getCurrentChats();
        if (cachedChats.length > 0) {
          // Search in cached chat names only
          const nameResults = cachedChats
            .filter(c => c?.name?.toLowerCase()?.includes(queryLower))
            .map(c => ({
              id: `name_${c.id}`,
              chatId: c.id,
              chatName: c.name,
              chatPhone: c.phone || c.id?.split("@")[0],
              isGroup: c.isGroup || false,
              body: `محادثة: ${c.name}`,
              timestamp: c.timestamp || Date.now() / 1000,
              fromMe: false,
              senderName: c.name,
              type: "name_match"
            }));
          
          socket.emit("searchProgress", { 
            status: "completed", 
            message: `تم العثور على ${nameResults.length} نتيجة (من الذاكرة)`,
            progress: 100
          });
          socket.emit("searchResults", { results: nameResults, query, fromCache: true });
          return;
        }
        
        // Check cache for previous search results
        const cached = searchResultsCache.get(cacheKey);
        if (cached) {
          socket.emit("searchProgress", { 
            status: "completed", 
            message: `${cached.results.length} نتيجة (محفوظة)`,
            progress: 100
          });
          socket.emit("searchResults", { ...cached, fromCache: true });
          return;
        }
        
        socket.emit("searchProgress", { status: "error", message: "لا يمكن الوصول للمحادثات", progress: 0 });
        socket.emit("searchResults", { results: [], query });
        return;
      }

      const searchResults = [];
      const chatsToSearch = allChats.slice(0, maxChats);
      const totalChats = chatsToSearch.length;

      console.log(`Searching in ${totalChats} chats...`);

      socket.emit("searchProgress", { 
        status: "searching", 
        message: `تم العثور على ${allChats.length} محادثة، جاري البحث...`,
        progress: 10
      });

      let skippedChats = 0;
      for (let i = 0; i < chatsToSearch.length; i++) {
        const chat = chatsToSearch[i];
        
        // Check client health periodically
        if (i % 10 === 0 && !isClientReady()) {
          console.log("Client disconnected during search, using partial results");
          break;
        }
        
        // Fetch messages with retry for each chat
        let messages = null;
        for (let msgAttempt = 0; msgAttempt < 3; msgAttempt++) {
          messages = await safeOperation(
            () => chat.fetchMessages({ limit: maxMessagesPerChat }),
            15000,
            null
          );
          if (messages) break;
          await wait(300);
        }
        
        if (messages && Array.isArray(messages)) {
          for (const msg of messages) {
            try {
              if (msg?.body && msg.body.toLowerCase().includes(queryLower)) {
                const phoneNumber = chat?.id?._serialized?.split("@")[0] || "unknown";
                
                let senderName = "أنا";
                if (!msg.fromMe && chat?.isGroup) {
                  senderName = msg.author ? msg.author.split("@")[0] : "مجهول";
                } else if (!msg.fromMe) {
                  senderName = chat?.name || phoneNumber;
                }
                
                searchResults.push({
                  id: msg?.id?._serialized || `msg_${Date.now()}_${Math.random()}`,
                  chatId: chat?.id?._serialized || "",
                  chatName: chat?.name || phoneNumber,
                  chatPhone: phoneNumber,
                  isGroup: chat?.isGroup || false,
                  body: msg.body,
                  timestamp: msg.timestamp || Date.now() / 1000,
                  fromMe: msg.fromMe ?? false,
                  senderName: senderName,
                  type: msg.type || "chat",
                });
              }
            } catch (e) {
              // Skip this message
            }
          }
        } else {
          skippedChats++;
        }

        // Emit progress every chat
        const progress = Math.round(10 + ((i + 1) / totalChats) * 85);
        if (i % 5 === 0 || i === totalChats - 1) {
          socket.emit("searchProgress", { 
            status: "searching", 
            message: `جاري البحث... (${i + 1}/${totalChats})`,
            progress: progress
          });
        }
      }

      console.log(`Found ${searchResults.length} results for "${query}" (skipped ${skippedChats} chats)`);
      
      // Sort by timestamp (newest first)
      searchResults.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
      
      // Cache results
      searchResultsCache.set(cacheKey, { results: searchResults, query, timestamp: Date.now() });
      
      // Limit cache size
      if (searchResultsCache.size > 50) {
        const oldestKey = searchResultsCache.keys().next().value;
        searchResultsCache.delete(oldestKey);
      }
      
      socket.emit("searchProgress", { 
        status: "completed", 
        message: `تم العثور على ${searchResults.length} نتيجة`,
        progress: 100
      });

      socket.emit("searchResults", { results: searchResults, query });
    });

    // Logout
    socket.on("logout", async () => {
      try {
        console.log("Logout requested...");
        
        // Mark as not ready immediately to prevent new operations
        isReady = false;
        clientReadyStates.set(currentAccountId, false);
        io.emit("status", { isReady: false });
        
        // Clear chats from memory
        setCurrentChats([]);
        
        // Try to logout gracefully
        if (whatsappClient) {
          try {
            await whatsappClient.logout();
            console.log("Logout successful");
          } catch (logoutError) {
            // Ignore errors during logout - context might already be destroyed
            console.log("Logout completed with warning:", logoutError.message);
          }
          
          // Clean up the client
          try {
            await whatsappClient.destroy();
          } catch (e) {
            // Ignore destroy errors
          }
          
          whatsappClients.delete(currentAccountId);
          clientReadyStates.delete(currentAccountId);
        }
        
        io.emit("logout");
      } catch (error) {
        console.error("Logout error:", error.message);
        // Even on error, send logout event to clear frontend data
        isReady = false;
        setCurrentChats([]);
        io.emit("status", { isReady: false });
        io.emit("logout");
      }
    });

    // ==================== Professional Streaming Sync System ====================
    
    // Track sync state to allow cancellation and concurrent message handling
    let syncInProgress = false;
    let syncCancelled = false;
    
    // Profile picture cache to avoid repeated fetching
    const profilePicCache = new Map(); // chatId -> { url, fetchedAt }
    const PROFILE_PIC_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours
    
    // Type labels for messages
    const typeLabels = {
      chat: "نص",
      image: "صورة 📷",
      video: "فيديو 🎥",
      audio: "صوت 🎵",
      ptt: "رسالة صوتية 🎤",
      document: "مستند 📄",
      sticker: "ملصق",
      location: "موقع 📍",
      contact: "جهة اتصال 👤",
      poll_creation: "استطلاع 📊",
    };
    
    // Fast chat processing - without profile pics (for speed)
    const processChatFast = (chat) => {
      const phoneNumber = chat.id._serialized.split("@")[0];
      
      // Get participants for groups (sync, from existing data)
      let participants = [];
      if (chat.isGroup && chat.participants) {
        try {
          participants = chat.participants.map(p => ({
            id: p.id._serialized,
            name: p.id.user,
            isAdmin: p.isAdmin || false,
            isSuperAdmin: p.isSuperAdmin || false,
          }));
        } catch (e) {}
      }
      
      // Get last message info
      let lastMessageData = null;
      if (chat.lastMessage) {
        try {
          const msg = chat.lastMessage;
          let senderName = "أنا";
          
          if (!msg.fromMe && chat.isGroup) {
            const senderId = msg.author || msg.from;
            senderName = senderId ? senderId.split("@")[0] : "مجهول";
          } else if (!msg.fromMe) {
            senderName = chat.name || phoneNumber;
          }
          
          lastMessageData = {
            body: msg.body || typeLabels[msg.type] || "",
            fromMe: msg.fromMe || false,
            timestamp: msg.timestamp || Date.now() / 1000,
            type: msg.type || "chat",
            typeLabel: typeLabels[msg.type] || "نص",
            senderName: senderName,
          };
        } catch (e) {}
      }
      
      // Check cache for profile pic
      let profilePic = null;
      const cached = profilePicCache.get(chat.id._serialized);
      if (cached && (Date.now() - cached.fetchedAt) < PROFILE_PIC_CACHE_TTL) {
        profilePic = cached.url;
      }
      
      return {
        id: chat.id._serialized,
        name: chat.name || chat.id.user || phoneNumber || "Unknown",
        phone: phoneNumber,
        profilePic: profilePic,
        isGroup: chat.isGroup || false,
        participants: participants,
        participantCount: chat.isGroup ? (participants.length || chat.groupMetadata?.participants?.length || 0) : 0,
        unreadCount: chat.unreadCount || 0,
        lastMessage: lastMessageData,
        timestamp: chat.timestamp || Date.now() / 1000,
      };
    };
    
    // Fetch profile picture lazily (called on demand)
    const fetchProfilePic = async (chatId) => {
      try {
        // Check cache first
        const cached = profilePicCache.get(chatId);
        if (cached && (Date.now() - cached.fetchedAt) < PROFILE_PIC_CACHE_TTL) {
          return cached.url;
        }
        
        const chat = await whatsappClient.getChatById(chatId);
        const contact = await Promise.race([
          chat.getContact(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 1500))
        ]);
        const profilePic = await Promise.race([
          contact.getProfilePicUrl(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 1000))
        ]);
        
        profilePicCache.set(chatId, { url: profilePic || null, fetchedAt: Date.now() });
        return profilePic;
      } catch (e) {
        profilePicCache.set(chatId, { url: null, fetchedAt: Date.now() });
        return null;
      }
    };
    
    // Handle profile picture requests from client
    socket.on("getProfilePic", async ({ chatId }) => {
      const profilePic = await fetchProfilePic(chatId);
      socket.emit("profilePic", { chatId, url: profilePic });
    });
    
    // Batch fetch profile pics for visible chats
    socket.on("getProfilePics", async ({ chatIds }) => {
      const results = {};
      const batchSize = 5;
      for (let i = 0; i < chatIds.length; i += batchSize) {
        const batch = chatIds.slice(i, i + batchSize);
        await Promise.all(batch.map(async (chatId) => {
          results[chatId] = await fetchProfilePic(chatId);
        }));
      }
      socket.emit("profilePics", results);
    });

    // Cancel ongoing sync
    socket.on("cancelSync", () => {
      if (syncInProgress) {
        console.log("Sync cancelled by user");
        syncCancelled = true;
        socket.emit("syncProgress", {
          status: "cancelled",
          message: "تم إلغاء المزامنة",
          progress: 0,
          total: 0,
          current: 0
        });
      }
    });

    // Sync all chats with streaming - Professional Edition
    socket.on("syncAllChats", async ({ maxChats, incrementalOnly = false } = {}) => {
      if (!isReady) {
        console.log("Sync requested but WhatsApp not ready");
        socket.emit("chatsError", { message: "WhatsApp not ready" });
        socket.emit("syncProgress", { 
          status: "error", 
          message: "واتساب غير جاهز",
          progress: 0,
          total: 0,
          current: 0
        });
        return;
      }

      // Prevent multiple syncs
      if (syncInProgress) {
        console.log("Sync already in progress");
        socket.emit("syncProgress", {
          status: "info",
          message: "المزامنة قيد التنفيذ بالفعل...",
          progress: 0,
          total: 0,
          current: 0
        });
        return;
      }

      syncInProgress = true;
      syncCancelled = false;

      try {
        console.log("Starting FAST streaming sync (no profile pics)...");
        const syncStartTime = Date.now();

        // Emit sync started
        socket.emit("syncProgress", { 
          status: "started", 
          message: "🚀 بدء المزامنة السريعة...",
          progress: 1,
          total: 0,
          current: 0
        });
        
        // Update Convex sync status
        if (isConvexReady()) {
          await syncStatusDb.update(currentAccountId, {
            status: "syncing",
            progress: 1,
            totalChats: 0,
            syncedChats: 0,
            message: "بدء المزامنة...",
          }).catch(() => {});
        }
        
        // Clear existing chats for fresh sync (unless incremental)
        if (!incrementalOnly) {
          socket.emit("syncClear");
        }
        
        // Fetch all chats with retry logic
        console.log("Fetching chat list...");
        socket.emit("syncProgress", { 
          status: "fetching", 
          message: "📥 جاري جلب قائمة المحادثات...",
          progress: 3,
          total: 0,
          current: 0
        });

        let allChats;
        const maxRetries = 3;
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          try {
            // Check if client and page are available
            if (!whatsappClient || !whatsappClient.pupPage) {
              throw new Error("Client not ready");
            }
            
            allChats = await whatsappClient.getChats();
            console.log(`Found ${allChats.length} chats in ${Date.now() - syncStartTime}ms`);
            break; // Success, exit retry loop
          } catch (error) {
            console.error(`Fetch attempt ${attempt} failed:`, error.message);
            
            // If it's a detached frame error, try to use cached data
            if (error.message.includes('detached Frame') || error.message.includes('Target closed')) {
              console.log("Browser page detached, trying cached data...");
              const cachedChats = await getCurrentChats();
              if (cachedChats.length > 0) {
                console.log(`Using ${cachedChats.length} cached chats`);
                socket.emit("chats", cachedChats);
                socket.emit("syncProgress", { 
                  status: "completed", 
                  message: `✅ تم إرسال ${cachedChats.length} محادثة من الذاكرة المؤقتة`,
                  progress: 100,
                  total: cachedChats.length,
                  current: cachedChats.length
                });
                syncInProgress = false;
                return;
              }
            }
            
            if (attempt === maxRetries) {
              socket.emit("syncProgress", { 
                status: "error", 
                message: `❌ خطأ في جلب المحادثات: ${error.message}`,
                progress: 0,
                total: 0,
                current: 0
              });
              
              if (isConvexReady()) {
                await syncStatusDb.fail(currentAccountId, error.message).catch(() => {});
              }
              
              syncInProgress = false;
              return;
            }
            
            // Wait before retry
            await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
          }
        }

        if (syncCancelled) {
          syncInProgress = false;
          return;
        }

        // Determine total chats to process
        const totalChats = maxChats ? Math.min(allChats.length, maxChats) : allChats.length;
        const chatsToProcess = allChats.slice(0, totalChats);

        if (totalChats === 0) {
          socket.emit("syncProgress", { 
            status: "completed", 
            message: "📭 لا توجد محادثات للمزامنة",
            progress: 100,
            total: 0,
            current: 0
          });
          socket.emit("chats", []);
          syncInProgress = false;
          return;
        }

        // Update Convex with total count
        if (isConvexReady()) {
          await syncStatusDb.startSync(currentAccountId, totalChats).catch(() => {});
        }

        console.log(`Processing ${totalChats} chats with FAST sync...`);
        socket.emit("syncProgress", { 
          status: "processing", 
          message: `⚡ معالجة ${totalChats} محادثة بسرعة فائقة...`,
          progress: 5,
          total: totalChats,
          current: 0
        });

        // Get existing chats for incremental sync comparison
        let existingChatsMap = new Map();
        if (incrementalOnly) {
          const existingChats = getCurrentChatsSync();
          existingChats.forEach(chat => existingChatsMap.set(chat.id, chat));
        }

        const processedChats = [];
        let successCount = 0;
        let errorCount = 0;
        let unchangedCount = 0;
        
        // Batch processing for speed - process multiple chats in parallel
        const PARALLEL_BATCH_SIZE = 50; // Process 50 chats at a time
        const CONVEX_BATCH_SIZE = 20;
        let convexBatch = [];

        // Process chats in parallel batches for MASSIVE speed improvement
        for (let batchStart = 0; batchStart < chatsToProcess.length; batchStart += PARALLEL_BATCH_SIZE) {
          if (syncCancelled) {
            console.log("Sync cancelled during processing");
            syncInProgress = false;
            return;
          }

          const batchEnd = Math.min(batchStart + PARALLEL_BATCH_SIZE, chatsToProcess.length);
          const batch = chatsToProcess.slice(batchStart, batchEnd);

          // Process entire batch in parallel using FAST sync (no async profile pic fetching)
          const batchResults = batch.map((chat, idx) => {
            try {
              const processedChat = processChatFast(chat);
              return { success: true, chat: processedChat, index: batchStart + idx };
            } catch (e) {
              const phoneNumber = chat.id._serialized.split("@")[0];
              return {
                success: false,
                chat: {
                  id: chat.id._serialized,
                  name: chat.name || phoneNumber || "Unknown",
                  phone: phoneNumber,
                  profilePic: null,
                  isGroup: chat.isGroup || false,
                  participants: [],
                  participantCount: 0,
                  unreadCount: 0,
                  lastMessage: null,
                  timestamp: chat.timestamp || Date.now() / 1000,
                },
                index: batchStart + idx
              };
            }
          });

          // Process results and emit to client
          for (const result of batchResults) {
            const processedChat = result.chat;
            const i = result.index;
            
            if (!result.success) {
              errorCount++;
            }
            
            // Check if chat changed (for incremental sync)
            if (incrementalOnly && existingChatsMap.has(processedChat.id)) {
              const existing = existingChatsMap.get(processedChat.id);
              if (existing.lastMessage?.timestamp === processedChat.lastMessage?.timestamp &&
                  existing.unreadCount === processedChat.unreadCount) {
                unchangedCount++;
                processedChats.push(processedChat);
                continue;
              }
            }
            
            processedChats.push(processedChat);
            if (result.success) successCount++;
            
            convexBatch.push(processedChat);

            // Batch save to Convex
            if (convexBatch.length >= CONVEX_BATCH_SIZE) {
              if (isConvexReady()) {
                chatsDb.batchUpsert(currentAccountId, convexBatch).catch(e => 
                  console.error("Error batch saving to Convex:", e.message)
                );
              }
              convexBatch = [];
            }
          }

          // Emit progress after each batch
          const progress = Math.round(5 + (batchEnd / totalChats) * 93);
          socket.emit("syncProgress", { 
            status: "processing", 
            message: `⚡ تم معالجة ${batchEnd} من ${totalChats} محادثة`,
            progress: progress,
            total: totalChats,
            current: batchEnd
          });
          
          // Update Convex progress
          if (isConvexReady()) {
            syncStatusDb.updateProgress(currentAccountId, batchEnd, totalChats, `Batch ${Math.ceil(batchEnd/PARALLEL_BATCH_SIZE)}`).catch(() => {});
          }

          console.log(`Fast synced batch: ${batchEnd}/${totalChats} (${Date.now() - syncStartTime}ms elapsed)`);
          
          // Yield to event loop between batches
          await new Promise(resolve => setImmediate(resolve));
        }

        // Save remaining batch to Convex
        if (convexBatch.length > 0 && isConvexReady()) {
          await chatsDb.batchUpsert(currentAccountId, convexBatch).catch(e => 
            console.error("Error saving final batch to Convex:", e.message)
          );
        }

        // Update account chats
        setCurrentChats(processedChats);

        // Calculate sync time
        const syncDuration = ((Date.now() - syncStartTime) / 1000).toFixed(1);

        // Emit completion
        let successMessage;
        if (incrementalOnly && unchangedCount > 0) {
          successMessage = `✅ تم تحديث ${successCount} محادثة (${unchangedCount} بدون تغيير) في ${syncDuration} ثانية`;
        } else if (errorCount > 0) {
          successMessage = `✅ تم مزامنة ${successCount} محادثة (${errorCount} أخطاء) في ${syncDuration} ثانية`;
        } else {
          successMessage = `✅ تم مزامنة ${successCount} محادثة في ${syncDuration} ثانية فقط!`;
        }

        console.log(`FAST SYNC COMPLETE: ${successCount} chats in ${syncDuration}s`);
        
        // Update Convex completion status
        if (isConvexReady()) {
          await syncStatusDb.complete(currentAccountId, totalChats).catch(() => {});
          eventsDb.log(currentAccountId, "sync_complete", 
            `Fast synced ${successCount} chats in ${syncDuration}s`
          ).catch(() => {});
        }
        
        socket.emit("syncProgress", { 
          status: "completed", 
          message: successMessage,
          progress: 100,
          total: totalChats,
          current: totalChats,
          successCount: successCount,
          errorCount: errorCount,
          unchangedCount: unchangedCount,
          duration: syncDuration
        });

        // Broadcast to all clients that sync is complete
        io.emit("syncComplete", { 
          total: processedChats.length,
          success: successCount,
          errors: errorCount,
          unchanged: unchangedCount,
          duration: syncDuration
        });

        // Send complete chats array as final confirmation
        const finalChats = await getCurrentChats();
        socket.emit("chats", finalChats);

      } catch (error) {
        console.error("Sync error:", error);
        socket.emit("syncProgress", { 
          status: "error", 
          message: `❌ حدث خطأ: ${error.message}`,
          progress: 0,
          total: 0,
          current: 0
        });
        socket.emit("chatsError", { message: error.message });
        
        // Log error to Convex
        if (isConvexReady()) {
          await syncStatusDb.fail(currentAccountId, error.message).catch(() => {});
        }
      } finally {
        syncInProgress = false;
        syncCancelled = false;
      }
    });

    // Quick sync - for refreshing without full re-sync
    socket.on("quickSync", async () => {
      if (!isReady) {
        socket.emit("chatsError", { message: "WhatsApp not ready" });
        return;
      }

      try {
        console.log("Quick sync started...");
        socket.emit("syncProgress", {
          status: "quick",
          message: "🚀 مزامنة سريعة...",
          progress: 50,
          total: 0,
          current: 0
        });

        const allChats = await whatsappClient.getChats();
        
        // Update ALL chats timestamps and unread counts using fast processing
        const quickUpdates = allChats.map(chat => {
          const phoneNumber = chat.id._serialized.split("@")[0];
          let lastMessageBody = null;
          let lastMessageFromMe = false;
          let lastMessageType = "chat";
          
          if (chat.lastMessage) {
            lastMessageBody = chat.lastMessage.body || typeLabels[chat.lastMessage.type] || "";
            lastMessageFromMe = chat.lastMessage.fromMe || false;
            lastMessageType = chat.lastMessage.type || "chat";
          }
          
          return {
            id: chat.id._serialized,
            name: chat.name || chat.id.user || phoneNumber || "Unknown",
            unreadCount: chat.unreadCount || 0,
            timestamp: chat.timestamp || Date.now() / 1000,
            lastMessageBody: lastMessageBody,
            lastMessageFromMe: lastMessageFromMe,
            lastMessageType: lastMessageType,
          };
        });

        socket.emit("quickSyncData", quickUpdates);
        socket.emit("syncProgress", {
          status: "completed",
          message: `✅ تم تحديث ${quickUpdates.length} محادثة بسرعة`,
          progress: 100,
          total: quickUpdates.length,
          current: quickUpdates.length
        });
        
        // Broadcast quick sync updates to all clients
        io.emit("quickSyncComplete", { count: quickUpdates.length });

      } catch (error) {
        console.error("Quick sync error:", error);
        socket.emit("chatsError", { message: error.message });
      }
    });

    // Incremental sync - only syncs changed chats
    socket.on("incrementalSync", async () => {
      if (!isReady) {
        socket.emit("chatsError", { message: "WhatsApp not ready" });
        return;
      }

      console.log("Starting incremental sync...");
      socket.emit("syncProgress", {
        status: "incremental",
        message: "🔄 مزامنة تدريجية...",
        progress: 10,
        total: 0,
        current: 0
      });

      // Trigger incremental sync
      socket.emit("syncAllChats", { incrementalOnly: true });
    });

    // Get sync status from Convex
    socket.on("getSyncStatus", async () => {
      if (!isConvexReady()) {
        socket.emit("syncStatusData", null);
        return;
      }

      try {
        const status = await syncStatusDb.get(currentAccountId);
        socket.emit("syncStatusData", status);
      } catch (e) {
        console.error("Error getting sync status:", e.message);
        socket.emit("syncStatusData", null);
      }
    });

    // Force sync from Convex (load cached data)
    socket.on("loadFromCloud", async () => {
      if (!isConvexReady()) {
        socket.emit("chatsError", { message: "Convex not ready" });
        return;
      }

      try {
        console.log("Loading chats from Convex...");
        socket.emit("syncProgress", {
          status: "loading",
          message: "☁️ جاري التحميل من السحابة...",
          progress: 50,
          total: 0,
          current: 0
        });

        const cloudChats = await chatsDb.getByAccountId(currentAccountId);
        
        if (cloudChats && cloudChats.length > 0) {
          accountChats.set(currentAccountId, cloudChats);
          socket.emit("chats", cloudChats);
          socket.emit("syncProgress", {
            status: "completed",
            message: `☁️ تم تحميل ${cloudChats.length} محادثة من السحابة`,
            progress: 100,
            total: cloudChats.length,
            current: cloudChats.length
          });
          console.log(`Loaded ${cloudChats.length} chats from Convex`);
        } else {
          socket.emit("syncProgress", {
            status: "completed",
            message: "📭 لا توجد محادثات في السحابة",
            progress: 100,
            total: 0,
            current: 0
          });
        }
      } catch (error) {
        console.error("Error loading from Convex:", error);
        socket.emit("chatsError", { message: error.message });
      }
    });

    // ==================== Account Management ====================
    
    // Get all accounts (filtered by userId if provided)
    socket.on("getAccounts", (data) => {
      const userId = data?.userId;
      console.log("Getting accounts...", userId ? `for user: ${userId}` : "all");
      
      let filteredAccounts = accounts;
      
      // If userId is provided, filter accounts by userId
      if (userId) {
        // Get accounts that belong to this user OR have no userId (legacy accounts)
        filteredAccounts = accounts.filter(a => !a.userId || a.userId === userId);
        
        // If there are legacy accounts (without userId), assign them to this user (first login gets them)
        // This is for admin user who had accounts before userId was implemented
        const legacyAccounts = filteredAccounts.filter(a => !a.userId);
        if (legacyAccounts.length > 0) {
          console.log(`Found ${legacyAccounts.length} legacy accounts, keeping for user`);
          // Don't auto-assign to maintain backward compatibility
        }
        
        // ONLY create new account if NO accounts exist at all for this user
        if (filteredAccounts.length === 0) {
          console.log("No accounts for user, creating default account...");
          const defaultAccount = {
            id: `account_${Date.now()}`,
            name: "حسابي",
            phone: null,
            isActive: true,
            userId: userId
          };
          accounts.push(defaultAccount);
          saveAccounts(accounts);
          filteredAccounts = [defaultAccount];
          
          // Set as current account
          currentAccountId = defaultAccount.id;
          
          // Initialize this account (request QR) - ONLY for NEW accounts
          setTimeout(() => {
            initializeAccount(defaultAccount.id);
          }, 500);
        } else {
          // Use existing active account or first available
          const activeAccount = filteredAccounts.find(a => a.isActive) || filteredAccounts[0];
          if (activeAccount && currentAccountId !== activeAccount.id) {
            console.log("Using existing account:", activeAccount.id);
            currentAccountId = activeAccount.id;
            
            // Check if this account already has a ready client
            const existingClient = whatsappClients.get(activeAccount.id);
            const isClientReady = clientReadyStates.get(activeAccount.id);
            
            if (existingClient && isClientReady) {
              console.log("Client already ready for this account");
              isReady = true;
              whatsappClient = existingClient;
              socket.emit("status", { isReady: true });
            } else {
              // Initialize the account
              console.log("Initializing existing account...");
              initializeAccount(activeAccount.id);
            }
          }
        }
      }
      
      socket.emit("accounts", filteredAccounts);
      socket.emit("currentAccount", currentAccountId);
    });

    // Add new account
    socket.on("addAccount", ({ name, userId }) => {
      console.log("Adding new account:", name, "for user:", userId);
      
      if (!name || !name.trim()) {
        console.log("Account name is empty, ignoring");
        return;
      }
      
      const newAccount = {
        id: `account_${Date.now()}`,
        name: name.trim(),
        phone: null,
        isActive: false,
        userId: userId || null
      };
      
      accounts.push(newAccount);
      saveAccounts(accounts);
      
      console.log("Account added successfully:", newAccount.id);
      socket.emit("accountAdded", newAccount);
      
      // Send filtered accounts based on userId
      if (userId) {
        const filteredAccounts = accounts.filter(a => !a.userId || a.userId === userId);
        socket.emit("accounts", filteredAccounts);
      } else {
        socket.emit("accounts", accounts);
      }
    });

    // Switch to different account
    socket.on("switchAccount", async ({ accountId }) => {
      console.log("Switching to account:", accountId);
      
      const account = accounts.find(a => a.id === accountId);
      if (!account) {
        console.log("Account not found:", accountId);
        return;
      }
      
      // Don't switch if already on this account AND client is ready
      if (currentAccountId === accountId) {
        const existingClient = whatsappClients.get(accountId);
        const isClientReady = clientReadyStates.get(accountId);
        
        if (existingClient && isClientReady) {
          console.log("Already on this account and client is ready");
          socket.emit("currentAccount", currentAccountId);
          socket.emit("accounts", accounts);
          io.emit("status", { isReady: true });
          return;
        }
        
        // Client not ready, need to initialize
        console.log("Already on this account but client not ready, initializing...");
        
        isReady = false;
        setCurrentChats([]);
        io.emit("status", { isReady: false });
        io.emit("qrCleared");
        
        // Destroy existing client if any to avoid "browser already running" error
        if (existingClient) {
          try {
            console.log("Destroying existing client before reinitializing...");
            await existingClient.destroy();
          } catch (e) {
            console.log("Error destroying client (may already be closed):", e.message);
            // Clean up orphaned browser processes if destroy failed
            await cleanupOrphanedBrowser(accountId);
          }
          whatsappClients.delete(accountId);
          clientReadyStates.delete(accountId);
        }
        
        // Create fresh client
        const client = createWhatsAppClient(accountId);
        whatsappClients.set(accountId, client);
        setupClientEvents(client, accountId);
        whatsappClient = client;
        
        try {
          await client.initialize();
        } catch (error) {
          console.error(`Failed to initialize account ${accountId}:`, error.message);
          
          // If browser is already running, clean up and retry once
          if (error.message.includes("browser is already running")) {
            console.log("Browser conflict detected, cleaning up and retrying...");
            whatsappClients.delete(accountId);
            clientReadyStates.delete(accountId);
            await cleanupOrphanedBrowser(accountId);
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            const retryClient = createWhatsAppClient(accountId);
            whatsappClients.set(accountId, retryClient);
            setupClientEvents(retryClient, accountId);
            whatsappClient = retryClient;
            
            try {
              await retryClient.initialize();
            } catch (retryError) {
              console.error(`Retry also failed: ${retryError.message}`);
            }
          }
        }
        return;
      }
      
      // Update active state
      accounts = accounts.map(a => ({
        ...a,
        isActive: a.id === accountId
      }));
      
      // Store previous account ID
      const previousAccountId = currentAccountId;
      currentAccountId = accountId;
      saveAccounts(accounts);
      
      // IMPORTANT: Stop ALL running browsers to avoid conflicts
      // On Railway, we can only run one browser at a time due to resource limits
      if (whatsappClients.size > 0) {
        console.log(`Stopping all running browsers before switching to ${accountId}...`);
        await stopAllClients();
        // Extra wait for browser processes to fully terminate
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      
      // Check if client already exists for this account
      let client = whatsappClients.get(accountId);
      const isClientReady = clientReadyStates.get(accountId);
      
      if (client && isClientReady) {
        // Client exists and is ready, use it directly
        console.log("Client already authenticated, using existing session");
        whatsappClient = client;
        isReady = true;
        
        // Update account phone number if available
        try {
          const clientInfo = client.info;
          if (clientInfo && clientInfo.wid) {
            const phoneNumber = clientInfo.wid.user;
            const accountIndex = accounts.findIndex(a => a.id === accountId);
            if (accountIndex !== -1 && accounts[accountIndex].phone !== phoneNumber) {
              accounts[accountIndex].phone = phoneNumber;
              saveAccounts(accounts);
            }
          }
        } catch (e) {
          // Ignore errors getting phone number
        }
        
        // Notify client that we're ready
        socket.emit("currentAccount", currentAccountId);
        socket.emit("accounts", accounts);
        io.emit("status", { isReady: true });
        io.emit("ready");
        
        // Send cached chats if available
        const cachedChats = getCurrentChats();
        if (cachedChats.length > 0) {
          console.log(`Sending ${cachedChats.length} cached chats for account ${account.name}`);
          socket.emit("chats", cachedChats);
        }
        
        console.log("Using existing session for account:", account.name);
        return;
      }
      
      // Client doesn't exist or not ready
      console.log("Client not ready, initializing...");
      
      // Reset state for new/unready account

      isReady = false;
      // Don't clear chats when switching - each account has its own storage
      
      // Notify client
      socket.emit("currentAccount", currentAccountId);
      socket.emit("accounts", accounts);
      io.emit("status", { isReady: false });
      io.emit("qrCleared");
      
      console.log("Switched to account:", account.name);
      console.log("Please wait while initializing account session...");
      
      // Destroy existing client if any to avoid "browser already running" error
      if (client) {
        try {
          console.log("Destroying existing client before reinitializing...");
          await client.destroy();
        } catch (e) {
          console.log("Error destroying client:", e.message);
          // Clean up orphaned browser processes if destroy failed
          await cleanupOrphanedBrowser(accountId);
        }
        whatsappClients.delete(accountId);
        clientReadyStates.delete(accountId);
      }
      
      // Create new client for this account
      const newClient = createWhatsAppClient(accountId);
      whatsappClients.set(accountId, newClient);
      setupClientEvents(newClient, accountId);
      
      // Set as current
      whatsappClient = newClient;
      
      // Initialize the client (will use saved session if available)
      try {
        await newClient.initialize();
      } catch (error) {
        console.error(`Failed to initialize account ${accountId}:`, error.message);
        
        // If browser is already running, clean up and retry once
        if (error.message.includes("browser is already running")) {
          console.log("Browser conflict detected, cleaning up and retrying...");
          whatsappClients.delete(accountId);
          clientReadyStates.delete(accountId);
          await cleanupOrphanedBrowser(accountId);
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          const retryClient = createWhatsAppClient(accountId);
          whatsappClients.set(accountId, retryClient);
          setupClientEvents(retryClient, accountId);
          whatsappClient = retryClient;
          
          try {
            await retryClient.initialize();
          } catch (retryError) {
            console.error(`Retry also failed: ${retryError.message}`);
          }
        }
      }
    });



    // Delete account
    socket.on("deleteAccount", ({ accountId }) => {
      console.log("Deleting account:", accountId);
      
      if (accounts.length <= 1) {
        console.log("Cannot delete the only account");
        return;
      }
      
      const accountIndex = accounts.findIndex(a => a.id === accountId);
      if (accountIndex === -1) {
        console.log("Account not found:", accountId);
        return;
      }
      
      const wasActive = accounts[accountIndex].isActive;
      accounts.splice(accountIndex, 1);
      
      // If deleted account was active, set another as active
      if (wasActive && accounts.length > 0) {
        accounts[0].isActive = true;
        currentAccountId = accounts[0].id;
      }
      
      saveAccounts(accounts);
      
      console.log("Account deleted successfully");
      socket.emit("accounts", accounts);
      socket.emit("currentAccount", currentAccountId);
    });

    // Clear all sessions and start fresh
    socket.on("clearSessions", async () => {
      console.log("Clearing all sessions...");
      
      try {
        // Stop and destroy all WhatsApp clients
        for (const [accountId, client] of whatsappClients.entries()) {
          try {
            console.log(`Destroying client for account: ${accountId}`);
            await client.destroy();
          } catch (e) {
            console.error(`Error destroying client ${accountId}:`, e.message);
            // Clean up orphaned browser for this account
            await cleanupOrphanedBrowser(accountId);
          }
        }
        
        // Clear all maps
        whatsappClients.clear();
        clientReadyStates.clear();
        
        // On Windows, kill ALL Chrome processes that might be holding locks
        if (process.platform === 'win32') {
          const { exec } = require('child_process');
          await new Promise((resolve) => {
            const wwebjsPath = path.join(__dirname, '.wwebjs_auth').replace(/\\/g, '\\\\');
            exec(`wmic process where "commandline like '%${wwebjsPath}%' and name='chrome.exe'" call terminate`, (error) => {
              if (!error) {
                console.log("Terminated all WhatsApp Chrome processes");
              }
              setTimeout(resolve, 2000); // Wait for processes to fully terminate
            });
          });
        }
        
        // Clear session directories
        const authPath = path.join(__dirname, ".wwebjs_auth");
        const cachePath = path.join(__dirname, ".wwebjs_cache");
        
        if (fs.existsSync(authPath)) {
          console.log("Removing auth directory...");
          try {
            fs.rmSync(authPath, { recursive: true, force: true });
          } catch (rmError) {
            console.log("Could not remove auth directory, trying alternative method...");
            // On Windows, use rd command which can sometimes work when fs.rmSync fails
            if (process.platform === 'win32') {
              const { execSync } = require('child_process');
              try {
                execSync(`rd /s /q "${authPath}"`, { stdio: 'ignore' });
              } catch (e) {
                console.log("Alternative removal also failed, directory may be in use");
              }
            }
          }
        }
        
        if (fs.existsSync(cachePath)) {
          console.log("Removing cache directory...");
          fs.rmSync(cachePath, { recursive: true, force: true });
        }
        
        // Reset state
        isReady = false;
        accountChats.clear(); // Clear all accounts' chats
        whatsappClient = null;
        
        // Reset accounts to default
        accounts = [{
          id: `account_${Date.now()}`,
          name: "حساب 1",
          phone: null,
          isActive: true
        }];
        currentAccountId = accounts[0].id;
        saveAccounts(accounts);
        
        console.log("All sessions cleared successfully!");
        
        // Notify clients
        io.emit("sessionsCleared", { success: true });
        io.emit("accounts", accounts);
        io.emit("currentAccount", currentAccountId);
        io.emit("status", { isReady: false });
        io.emit("qrCleared");
        
        // Reinitialize with fresh account
        setTimeout(() => {
          console.log("Reinitializing with fresh account...");
          initializeAccount(currentAccountId);
        }, 2000);
        
      } catch (error) {
        console.error("Error clearing sessions:", error);
        socket.emit("sessionsCleared", { success: false, error: error.message });
      }
    });

    socket.on("disconnect", () => {
      console.log("Client disconnected:", socket.id);
    });

  });

  // Error handlers for unhandled rejections
  process.on('unhandledRejection', (error) => {
    // Ignore common browser-related errors that are harmless
    const harmlessErrors = [
      'Target closed',
      'Execution context was destroyed',
      'Protocol error',
      'Session closed',
      'frame was detached',
      'Navigation timeout',
      'net::ERR_'
    ];
    
    const errorMsg = error?.message || String(error);
    const isHarmless = harmlessErrors.some(e => errorMsg.includes(e));
    
    if (isHarmless) {
      console.log('Browser context error (harmless):', errorMsg.substring(0, 100));
    } else {
      console.error('Unhandled Rejection:', error);
    }
  });

  process.on('uncaughtException', (error) => {
    const harmlessErrors = [
      'Execution context was destroyed',
      'Target closed',
      'Protocol error'
    ];
    
    const errorMsg = error?.message || String(error);
    const isHarmless = harmlessErrors.some(e => errorMsg.includes(e));
    
    if (isHarmless) {
      console.log('Browser exception (harmless):', errorMsg.substring(0, 100));
    } else {
      console.error('Uncaught Exception:', error);
    }
  });

  // Initialize current account's WhatsApp client
  if (currentAccountId) {
    initializeAccount(currentAccountId);
  }

  httpServer.listen(port, () => {
    console.log(`> Ready on http://${hostname}:${port}`);
  });
});
