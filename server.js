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
      if (currentAccountId !== accountId) return;
      
      console.log("New message received from:", message.from);
      
      let senderName = "مجهول";
      let senderPhone = message.from.split("@")[0];
      let chatName = senderPhone;
      let isGroup = message.from.includes("@g.us");
      
      try {
        const contact = await message.getContact();
        senderName = contact.pushname || contact.name || senderPhone;
        
        // Try to get chat info for chat name
        try {
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
          // Use sender name as chat name if chat fetch fails
          chatName = senderName;
        }
      } catch (e) {}
      
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
    
    // If there's an existing client that's not ready, destroy it first
    if (client) {
      try {
        console.log(`Destroying existing non-ready client for ${accountId}...`);
        await client.destroy();
      } catch (e) {
        console.log("Error destroying client (may already be closed):", e.message);
      }
      whatsappClients.delete(accountId);
      clientReadyStates.delete(accountId);
    }
    
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
      
      // If it's a Protocol error and we haven't retried yet, try again with fresh client
      if (retryCount < 1 && (error.message.includes("Protocol error") || error.message.includes("Session closed"))) {
        console.log("Puppeteer session error detected, retrying with fresh client...");
        
        // Clean up the failed client
        try {
          await client.destroy();
        } catch (e) {
          // Ignore cleanup errors
        }
        whatsappClients.delete(accountId);
        clientReadyStates.delete(accountId);
        
        // Wait a bit before retry
        await new Promise(resolve => setTimeout(resolve, 2000));
        
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
      
      // Retry function
      const fetchWithRetry = async (retries = 3) => {
        for (let i = 0; i < retries; i++) {
          try {
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
            if (i < retries - 1) {
              await delay(2000 * (i + 1)); // Exponential backoff
            } else {
              throw error;
            }
          }
        }
      };

      try {
        console.log("Fetching chats...");
        
        const allChats = await fetchWithRetry(3);
        if (!allChats) {
          socket.emit("chatsError", { message: "Failed to fetch chats after retries" });
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

    // Request to get messages for a specific chat (with media support)
    socket.on("getMessages", async ({ chatId, limit = 50 }) => {
      if (!isReady) {
        socket.emit("messagesError", { message: "WhatsApp not ready" });
        return;
      }

      try {
        const chat = await whatsappClient.getChatById(chatId);
        const messages = await chat.fetchMessages({ limit });
        
        const formattedMessages = await Promise.all(
          messages.map(async (msg) => {
            const messageData = {
              id: msg.id._serialized,
              body: msg.body,
              fromMe: msg.fromMe,
              timestamp: msg.timestamp,
              type: msg.type,
              hasMedia: msg.hasMedia || false,
              mediaUrl: null,
              mimetype: null,
              filename: null,
              duration: null,
              senderName: null,
            };
            
            // Get sender name for group messages
            if (!msg.fromMe && chat.isGroup) {
              try {
                const contact = await msg.getContact();
                messageData.senderName = contact.pushname || contact.name || msg.author?.split("@")[0] || "مجهول";
              } catch (e) {
                messageData.senderName = msg.author?.split("@")[0] || "مجهول";
              }
            }
            
            // Fetch media if available
            if (msg.hasMedia) {
              try {
                const media = await msg.downloadMedia();
                if (media) {
                  messageData.mediaUrl = `data:${media.mimetype};base64,${media.data}`;
                  messageData.mimetype = media.mimetype;
                  messageData.filename = media.filename;
                }
              } catch (e) {
                console.error("Error downloading media:", e.message);
              }
            }
            
            // Get duration for audio/video
            if (msg.type === "ptt" || msg.type === "audio") {
              try {
                messageData.duration = msg.duration || null;
              } catch (e) {
                // Ignore
              }
            }
            
            return messageData;
          })
        );
        
        socket.emit("messages", { chatId, messages: formattedMessages });
      } catch (error) {
        console.error("Error fetching messages:", error);
        socket.emit("messagesError", { message: error.message });
      }
    });

    // Send message
    socket.on("sendMessage", async ({ chatId, message }) => {
      if (!isReady) {
        socket.emit("sendMessageError", { message: "WhatsApp not ready" });
        return;
      }

      if (!chatId || !message) {
        socket.emit("sendMessageError", { message: "Chat ID and message are required" });
        return;
      }

      try {
        console.log(`Sending message to ${chatId}: ${message.substring(0, 50)}...`);
        
        let targetId = chatId;
        
        // Check if it's a LID format (Linked ID) - new WhatsApp format
        if (chatId.includes("@lid")) {
          // For LID format, try to find the phone number from cached chats
          const chats = await getCurrentChats();
          const cachedChat = chats.find(c => c.id === chatId);
          
          if (cachedChat && cachedChat.phone) {
            // Use the phone number to send
            targetId = cachedChat.phone + "@c.us";
            console.log(`LID detected, using phone number: ${targetId}`);
          }
        }
        
        // Try multiple methods to send the message
        let sentMessage = null;
        let lastError = null;
        
        // Method 1: Direct sendMessage (simplest)
        try {
          sentMessage = await whatsappClient.sendMessage(targetId, message);
          if (sentMessage) {
            console.log("Message sent via direct method");
          }
        } catch (e) {
          console.log("Method 1 failed:", e.message);
          lastError = e;
        }
        
        // Method 2: Get chat first, then send
        if (!sentMessage) {
          try {
            const chat = await whatsappClient.getChatById(targetId);
            if (chat && typeof chat.sendMessage === 'function') {
              sentMessage = await chat.sendMessage(message);
              if (sentMessage) {
                console.log("Message sent via chat.sendMessage");
              }
            }
          } catch (e) {
            console.log("Method 2 failed:", e.message);
            lastError = e;
          }
        }
        
        // Method 3: Use pupPage directly with WWebJS injected methods (last resort)
        if (!sentMessage && whatsappClient.pupPage) {
          try {
            console.log("Trying pupPage method...");
            const result = await whatsappClient.pupPage.evaluate(async (to, msg) => {
              try {
                // Use the injected WWebJS method
                if (window.WWebJS && window.WWebJS.sendMessage) {
                  const chatWid = window.Store.WidFactory.createWid(to);
                  await window.WWebJS.sendMessage(chatWid, msg, {});
                  return { success: true, method: 'WWebJS' };
                }
                
                // Fallback: Try direct Store methods
                const chatWid = window.Store.WidFactory.createWid(to);
                const chat = await window.Store.Chat.find(chatWid);
                if (chat) {
                  // Use the proper method to send message
                  const msgModel = new window.Store.MsgModel({
                    body: msg,
                    type: 'chat',
                    to: chatWid,
                  });
                  await window.Store.SendMessage.sendMsgToChat(chat, msg);
                  return { success: true, method: 'Store' };
                }
                return { success: false, error: 'Chat not found' };
              } catch (err) {
                return { success: false, error: err.message };
              }
            }, targetId, message);
            
            if (result && result.success) {
              console.log(`Message sent via pupPage (${result.method})`);
              sentMessage = { id: { _serialized: `manual_${Date.now()}` }, timestamp: Date.now() / 1000 };
            } else {
              console.log("pupPage method returned:", result);
            }
          } catch (e) {
            console.log("Method 3 failed:", e.message);
            lastError = e;
          }
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
          throw lastError || new Error("All send methods failed");
        }

      } catch (error) {
        console.error("Send message error:", error);
        socket.emit("sendMessageError", { message: error.message || "فشل إرسال الرسالة" });
      }
    });

    // Search messages across all chats
    socket.on("searchMessages", async ({ query, maxChats = 50, maxMessagesPerChat = 30 }) => {
      if (!isReady) {
        socket.emit("searchProgress", { status: "error", message: "واتساب غير جاهز", progress: 0 });
        socket.emit("searchResults", { results: [], query: "" });
        return;
      }

      if (!query || query.trim().length < 2) {
        socket.emit("searchResults", { results: [], query: "" });
        return;
      }

      try {
        console.log(`Searching for: "${query}"`);
        
        socket.emit("searchProgress", { 
          status: "searching", 
          message: `جاري البحث عن "${query}"...`,
          progress: 5
        });

        let allChats;
        try {
          allChats = await whatsappClient.getChats();
        } catch (e) {
          console.error("Failed to get chats for search:", e.message);
          socket.emit("searchProgress", { status: "error", message: "فشل جلب المحادثات", progress: 0 });
          socket.emit("searchResults", { results: [], query });
          return;
        }

        const searchResults = [];
        const chatsToSearch = allChats.slice(0, maxChats);
        const queryLower = query.toLowerCase();
        const totalChats = chatsToSearch.length;

        console.log(`Searching in ${totalChats} chats...`);

        socket.emit("searchProgress", { 
          status: "searching", 
          message: `تم العثور على ${allChats.length} محادثة، جاري البحث...`,
          progress: 10
        });

        for (let i = 0; i < chatsToSearch.length; i++) {
          const chat = chatsToSearch[i];
          
          try {
            const messages = await chat.fetchMessages({ limit: maxMessagesPerChat });
            
            for (const msg of messages) {
              if (msg.body && msg.body.toLowerCase().includes(queryLower)) {
                const phoneNumber = chat.id._serialized.split("@")[0];
                
                let senderName = "أنا";
                if (!msg.fromMe && chat.isGroup) {
                  senderName = msg.author ? msg.author.split("@")[0] : "مجهول";
                } else if (!msg.fromMe) {
                  senderName = chat.name || phoneNumber;
                }
                
                searchResults.push({
                  id: msg.id._serialized,
                  chatId: chat.id._serialized,
                  chatName: chat.name || phoneNumber,
                  chatPhone: phoneNumber,
                  isGroup: chat.isGroup || false,
                  body: msg.body,
                  timestamp: msg.timestamp,
                  fromMe: msg.fromMe,
                  senderName: senderName,
                  type: msg.type || "chat",
                });
              }
            }
          } catch (e) {
            // Skip this chat on error
            console.log(`Skipping chat ${i + 1} due to error`);
          }

          // Emit progress every chat
          const progress = Math.round(10 + ((i + 1) / totalChats) * 85);
          socket.emit("searchProgress", { 
            status: "searching", 
            message: `جاري البحث... (${i + 1}/${totalChats})`,
            progress: progress
          });
        }

        console.log(`Found ${searchResults.length} results for "${query}"`);
        
        // Sort by timestamp (newest first)
        searchResults.sort((a, b) => b.timestamp - a.timestamp);
        
        socket.emit("searchProgress", { 
          status: "completed", 
          message: `تم العثور على ${searchResults.length} نتيجة`,
          progress: 100
        });

        socket.emit("searchResults", { results: searchResults, query });

      } catch (error) {
        console.error("Search error:", error);
        socket.emit("searchProgress", { 
          status: "error", 
          message: `خطأ: ${error.message}`,
          progress: 0
        });
        socket.emit("searchResults", { results: [], query });
      }
    });

    // Logout
    socket.on("logout", async () => {
      try {
        console.log("Logout requested...");
        await whatsappClient.logout();
        isReady = false;
        setCurrentChats([]); // مسح المحادثات من الذاكرة
        io.emit("status", { isReady: false });
        io.emit("logout");
        console.log("Logout successful");
      } catch (error) {
        console.error("Logout error:", error);
        // حتى لو حدث خطأ، نرسل event logout لمسح البيانات في الواجهة
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
    
    // Process a single chat and return formatted data
    const processChat = async (chat, typeLabels) => {
      try {
        const phoneNumber = chat.id._serialized.split("@")[0];
        
        // Get profile picture with short timeout (non-blocking)
        let profilePic = null;
        try {
          const contact = await Promise.race([
            chat.getContact(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 2000))
          ]);
          profilePic = await Promise.race([
            contact.getProfilePicUrl(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 1500))
          ]);
        } catch (e) {
          // Skip profile pic on error or timeout - this is optional
        }
        
        // Get participants for groups (non-blocking)
        let participants = [];
        if (chat.isGroup && chat.participants) {
          try {
            participants = chat.participants.map(p => ({
              id: p.id._serialized,
              name: p.id.user,
              isAdmin: p.isAdmin || false,
              isSuperAdmin: p.isSuperAdmin || false,
            }));
          } catch (e) {
            // Skip participants on error
          }
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
          } catch (e) {
            // Skip last message on error
          }
        }
        
        return {
          id: chat.id._serialized,
          name: chat.name || chat.id.user || phoneNumber || "Unknown",
          phone: phoneNumber,
          profilePic: profilePic,
          isGroup: chat.isGroup || false,
          participants: participants,
          participantCount: participants.length,
          unreadCount: chat.unreadCount || 0,
          lastMessage: lastMessageData,
          timestamp: chat.timestamp || Date.now() / 1000,
        };
      } catch (e) {
        // Return minimal data on error
        const phoneNumber = chat.id._serialized.split("@")[0];
        return {
          id: chat.id._serialized,
          name: chat.name || chat.id.user || phoneNumber || "Unknown",
          phone: phoneNumber,
          profilePic: null,
          isGroup: chat.isGroup || false,
          participants: [],
          participantCount: 0,
          unreadCount: 0,
          lastMessage: null,
          timestamp: chat.timestamp || Date.now() / 1000,
        };
      }
    };

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
        console.log("Starting enhanced streaming sync...");
        
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

        // Emit sync started
        socket.emit("syncProgress", { 
          status: "started", 
          message: "🔄 بدء المزامنة المحسّنة...",
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
        
        // Fetch all chats
        console.log("Fetching chat list...");
        socket.emit("syncProgress", { 
          status: "fetching", 
          message: "📥 جاري جلب قائمة المحادثات...",
          progress: 3,
          total: 0,
          current: 0
        });

        let allChats;
        try {
          allChats = await whatsappClient.getChats();
          console.log(`Found ${allChats.length} chats`);
        } catch (error) {
          console.error("Error fetching chats:", error);
          socket.emit("syncProgress", { 
            status: "error", 
            message: `❌ خطأ في جلب المحادثات: ${error.message}`,
            progress: 0,
            total: 0,
            current: 0
          });
          
          // Log error to Convex
          if (isConvexReady()) {
            await syncStatusDb.fail(currentAccountId, error.message).catch(() => {});
          }
          
          syncInProgress = false;
          return;
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

        console.log(`Processing ${totalChats} chats with enhanced streaming...`);
        socket.emit("syncProgress", { 
          status: "processing", 
          message: `🔍 تم العثور على ${totalChats} محادثة، جاري المعالجة...`,
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
        
        // Batch size for Convex updates
        const CONVEX_BATCH_SIZE = 20;
        let convexBatch = [];

        // Process chats one by one with streaming
        for (let i = 0; i < chatsToProcess.length; i++) {
          // Check for cancellation
          if (syncCancelled) {
            console.log("Sync cancelled during processing");
            syncInProgress = false;
            return;
          }

          const chat = chatsToProcess[i];
          const chatName = chat.name || chat.id.user || chat.id._serialized.split("@")[0] || "Unknown";

          try {
            // Process single chat
            const processedChat = await processChat(chat, typeLabels);
            
            // Check if chat changed (for incremental sync)
            if (incrementalOnly && existingChatsMap.has(processedChat.id)) {
              const existing = existingChatsMap.get(processedChat.id);
              if (existing.lastMessage?.timestamp === processedChat.lastMessage?.timestamp &&
                  existing.unreadCount === processedChat.unreadCount) {
                unchangedCount++;
                processedChats.push(processedChat);
                continue; // Skip unchanged chats
              }
            }
            
            processedChats.push(processedChat);
            successCount++;
            
            // Add to Convex batch
            convexBatch.push(processedChat);

            // Stream this chat immediately to the client
            socket.emit("syncChat", {
              chat: processedChat,
              index: i,
              total: totalChats
            });

            // Calculate progress (5% to 98%)
            const progress = Math.round(5 + ((i + 1) / totalChats) * 93);
            
            // Emit progress with current chat name
            socket.emit("syncProgress", { 
              status: "processing", 
              message: `📱 مزامنة: ${chatName}`,
              progress: progress,
              total: totalChats,
              current: i + 1,
              chatName: chatName
            });
            
            // Update Convex progress every 10 chats
            if ((i + 1) % 10 === 0 && isConvexReady()) {
              syncStatusDb.updateProgress(
                currentAccountId, 
                i + 1, 
                totalChats, 
                chatName
              ).catch(() => {});
            }
            
            // Batch save to Convex
            if (convexBatch.length >= CONVEX_BATCH_SIZE) {
              if (isConvexReady()) {
                chatsDb.batchUpsert(currentAccountId, convexBatch).catch(e => 
                  console.error("Error batch saving to Convex:", e.message)
                );
              }
              convexBatch = [];
            }

            // Log every 10 chats for performance
            if ((i + 1) % 10 === 0 || i === 0) {
              console.log(`Synced ${i + 1}/${totalChats} - Current: ${chatName}`);
            }

          } catch (error) {
            console.error(`Error processing chat ${i}:`, error.message);
            errorCount++;
            
            // Still create minimal data on error
            const phoneNumber = chat.id._serialized.split("@")[0];
            const minimalChat = {
              id: chat.id._serialized,
              name: chatName,
              phone: phoneNumber,
              profilePic: null,
              isGroup: chat.isGroup || false,
              participants: [],
              participantCount: 0,
              unreadCount: 0,
              lastMessage: null,
              timestamp: chat.timestamp || Date.now() / 1000,
            };
            processedChats.push(minimalChat);
            
            socket.emit("syncChat", {
              chat: minimalChat,
              index: i,
              total: totalChats
            });
          }

          // Yield to event loop every 5 chats to allow receiving new messages
          if ((i + 1) % 5 === 0) {
            await new Promise(resolve => setImmediate(resolve));
          }
        }

        // Save remaining batch to Convex
        if (convexBatch.length > 0 && isConvexReady()) {
          await chatsDb.batchUpsert(currentAccountId, convexBatch).catch(e => 
            console.error("Error saving final batch to Convex:", e.message)
          );
        }

        // Update account chats
        setCurrentChats(processedChats);

        // Emit completion
        let successMessage;
        if (incrementalOnly && unchangedCount > 0) {
          successMessage = `✅ تم تحديث ${successCount} محادثة (${unchangedCount} بدون تغيير)`;
        } else if (errorCount > 0) {
          successMessage = `✅ تم مزامنة ${successCount} محادثة (${errorCount} أخطاء)`;
        } else {
          successMessage = `✅ تم مزامنة ${successCount} محادثة بنجاح!`;
        }

        console.log(successMessage);
        
        // Update Convex completion status
        if (isConvexReady()) {
          await syncStatusDb.complete(currentAccountId, totalChats).catch(() => {});
          eventsDb.log(currentAccountId, "sync_complete", 
            `Synced ${successCount} chats, ${errorCount} errors`
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
          unchangedCount: unchangedCount
        });

        // Broadcast to all clients that sync is complete
        io.emit("syncComplete", { 
          total: processedChats.length,
          success: successCount,
          errors: errorCount,
          unchanged: unchangedCount
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
        
        // Just update timestamps and unread counts without full processing
        const quickUpdates = allChats.slice(0, 100).map(chat => ({
          id: chat.id._serialized,
          unreadCount: chat.unreadCount || 0,
          timestamp: chat.timestamp || Date.now() / 1000,
          lastMessageBody: chat.lastMessage?.body || null,
          lastMessageFromMe: chat.lastMessage?.fromMe || false,
        }));

        socket.emit("quickSyncData", quickUpdates);
        socket.emit("syncProgress", {
          status: "completed",
          message: "✅ تم التحديث السريع",
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
          }
        }
        
        // Clear all maps
        whatsappClients.clear();
        clientReadyStates.clear();
        
        // Clear session directories
        const authPath = path.join(__dirname, ".wwebjs_auth");
        const cachePath = path.join(__dirname, ".wwebjs_cache");
        
        if (fs.existsSync(authPath)) {
          console.log("Removing auth directory...");
          fs.rmSync(authPath, { recursive: true, force: true });
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
    console.error('Unhandled Rejection:', error);
    if (error.message && error.message.includes('Target closed')) {
      console.log('Browser target closed, this is usually harmless');
    }
  });

  process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
  });

  // Initialize current account's WhatsApp client
  if (currentAccountId) {
    initializeAccount(currentAccountId);
  }

  httpServer.listen(port, () => {
    console.log(`> Ready on http://${hostname}:${port}`);
  });
});
