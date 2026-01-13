const { createServer } = require("http");
const { parse } = require("url");
const next = require("next");
const { Server } = require("socket.io");
const { Client, LocalAuth } = require("whatsapp-web.js");
const fs = require("fs");
const path = require("path");

const dev = process.env.NODE_ENV !== "production";
const hostname = "localhost";
const port = process.env.PORT || 3000;

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

// In-memory store for chats
let chats = [];
let isReady = false;

// Accounts management
const ACCOUNTS_FILE = path.join(__dirname, "accounts.json");
let currentAccountId = null;

// Load accounts from file
const loadAccounts = () => {
  try {
    if (fs.existsSync(ACCOUNTS_FILE)) {
      const data = fs.readFileSync(ACCOUNTS_FILE, "utf8");
      return JSON.parse(data);
    }
  } catch (e) {
    console.error("Error loading accounts:", e.message);
  }
  // Return default account if file doesn't exist or has error
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
      origin: "*",
      methods: ["GET", "POST"],
      credentials: true,
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
    });

    client.on("ready", () => {
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
            }
          }
        } catch (e) {
          console.error("Error getting client info:", e.message);
        }
        io.emit("status", { isReady: true });
        io.emit("ready");
      }
    });


    client.on("authenticated", () => {
      console.log(`WhatsApp client authenticated for account: ${accountId}`);
    });

    client.on("auth_failure", (msg) => {
      console.error(`Auth failure for account ${accountId}:`, msg);
      if (currentAccountId === accountId) {
        io.emit("authFailure", { message: msg });
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
    });


    client.on("message", async (message) => {
      if (currentAccountId !== accountId) return;
      
      console.log("New message received from:", message.from);
      
      let senderName = "مجهول";
      let senderPhone = message.from.split("@")[0];
      
      try {
        const contact = await message.getContact();
        senderName = contact.pushname || contact.name || senderPhone;
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
      });
    });

    client.on("message_create", async (message) => {
      if (currentAccountId !== accountId) return;
      
      if (message.fromMe) {
        console.log("Message sent to:", message.to);
        
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
  const initializeAccount = async (accountId) => {
    console.log(`Initializing account: ${accountId}`);
    
    isReady = false;
    chats = [];
    io.emit("status", { isReady: false });
    io.emit("qrCleared");
    
    let client = whatsappClients.get(accountId);
    
    if (!client) {
      client = createWhatsAppClient(accountId);
      whatsappClients.set(accountId, client);
      setupClientEvents(client, accountId);
    }
    
    whatsappClient = client;
    
    try {
      await client.initialize();
    } catch (error) {
      console.error(`Failed to initialize account ${accountId}:`, error.message);
    }
  };

  // Socket.io connection
  io.on("connection", (socket) => {
    console.log("Client connected:", socket.id);

    // Send current status
    socket.emit("status", { isReady });


    // Request to fetch chats
    socket.on("getChats", async () => {
      if (!isReady) {
        socket.emit("chatsError", { message: "WhatsApp not ready" });
        return;
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
        
        for (const chat of allChats.slice(0, 100)) {
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
        
        chats = processedChats;
        console.log(`Processed ${chats.length} chats successfully`);
        socket.emit("chats", chats);
        
      } catch (error) {
        console.error("Error fetching chats:", error.message, error.stack);
        socket.emit("chatsError", { message: error.message || "Unknown error" });
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
        
        const chat = await whatsappClient.getChatById(chatId);
        const sentMessage = await chat.sendMessage(message);
        
        console.log("Message sent successfully!");
        
        socket.emit("messageSent", { 
          success: true, 
          chatId,
          messageId: sentMessage.id._serialized,
          timestamp: sentMessage.timestamp
        });

      } catch (error) {
        console.error("Send message error:", error);
        socket.emit("sendMessageError", { message: error.message });
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
        chats = []; // مسح المحادثات من الذاكرة
        io.emit("status", { isReady: false });
        io.emit("logout");
        console.log("Logout successful");
      } catch (error) {
        console.error("Logout error:", error);
        // حتى لو حدث خطأ، نرسل event logout لمسح البيانات في الواجهة
        isReady = false;
        chats = [];
        io.emit("status", { isReady: false });
        io.emit("logout");
      }
    });

    // Sync all chats (fetch more chats with progress)
    socket.on("syncAllChats", async ({ maxChats } = {}) => {
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

      try {
        console.log("Syncing all chats...");
        
        // Emit sync started with initial progress
        socket.emit("syncProgress", { 
          status: "started", 
          message: "جاري جلب المحادثات...",
          progress: 1,
          total: 0,
          current: 0
        });
        
        // Force emit to ensure it's sent
        socket.volatile.emit("syncProgress", { 
          status: "started", 
          message: "جاري جلب المحادثات...",
          progress: 1,
          total: 0,
          current: 0
        });
        
        // إضافة timeout و progress indicator أثناء جلب المحادثات
        let progressInterval;
        const startProgressIndicator = () => {
          let fakeProgress = 1;
          progressInterval = setInterval(() => {
            fakeProgress = Math.min(fakeProgress + 0.5, 8);
            socket.emit("syncProgress", { 
              status: "started", 
              message: "جاري جلب قائمة المحادثات...",
              progress: fakeProgress,
              total: 0,
              current: 0
            });
          }, 500);
        };
        
        startProgressIndicator();
        
        let allChats;
        try {
          // جلب المحادثات بدون timeout - يعمل حتى مع عدد كبير جداً من المحادثات
          console.log("Fetching chats (no timeout - will wait as long as needed)...");
          
          // تحديث progress message
          socket.emit("syncProgress", { 
            status: "started", 
            message: "جاري جلب المحادثات... (قد يستغرق وقتاً مع عدد كبير من المحادثات)",
            progress: 5,
            total: 0,
            current: 0
          });
          
          // جلب المحادثات بدون timeout - سينتظر حتى يكتمل
          allChats = await whatsappClient.getChats();
          
          console.log(`Successfully got ${allChats.length} chats`);
          
        } catch (error) {
          clearInterval(progressInterval);
          console.error("Error getting chats after all retries:", error);
          socket.emit("syncProgress", { 
            status: "error", 
            message: `خطأ في جلب المحادثات: ${error.message}`,
            progress: 0,
            total: 0,
            current: 0
          });
          socket.volatile.emit("syncProgress", { 
            status: "error", 
            message: `خطأ في جلب المحادثات: ${error.message}`,
            progress: 0,
            total: 0,
            current: 0
          });
          return;
        }
        
        clearInterval(progressInterval);
        
        // لا يوجد حد أقصى - معالجة جميع المحادثات
        const totalChats = maxChats ? Math.min(allChats.length, maxChats) : allChats.length;
        console.log(`Found ${allChats.length} chats, processing all ${totalChats}...`);
        
        if (totalChats === 0) {
          socket.emit("syncProgress", { 
            status: "completed", 
            message: "لا توجد محادثات للمزامنة",
            progress: 100,
            total: 0,
            current: 0
          });
          socket.emit("chats", []);
          return;
        }
        
        socket.emit("syncProgress", { 
          status: "processing", 
          message: `تم العثور على ${allChats.length} محادثة، جاري المعالجة...`,
          progress: 10,
          total: totalChats,
          current: 0
        });
        
        const processedChats = [];
        const chatsToProcess = allChats.slice(0, totalChats);
        // زيادة حجم الـ batch لتحسين الأداء
        const batchSize = 20; // Process in batches for efficiency
        
        // Type labels
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
        
        for (let i = 0; i < chatsToProcess.length; i += batchSize) {
          const batch = chatsToProcess.slice(i, i + batchSize);
          
          // Process batch in parallel with better error handling
          const batchResults = await Promise.allSettled(
            batch.map(async (chat) => {
              try {
                const phoneNumber = chat.id._serialized.split("@")[0];
                
                // Get profile picture (optional, skip on error with timeout)
                let profilePic = null;
                try {
                  const contactPromise = chat.getContact();
                  const contact = await Promise.race([
                    contactPromise,
                    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000))
                  ]);
                  const picPromise = contact.getProfilePicUrl();
                  profilePic = await Promise.race([
                    picPromise,
                    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 2000))
                  ]);
                } catch (e) {
                  // Skip profile pic on error or timeout
                }
                
                // Get participants for groups
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
                return {
                  id: chat.id._serialized,
                  name: chat.name || chat.id.user || "Unknown",
                  phone: chat.id._serialized.split("@")[0],
                  profilePic: null,
                  isGroup: chat.isGroup || false,
                  participants: [],
                  participantCount: 0,
                  unreadCount: 0,
                  lastMessage: null,
                  timestamp: chat.timestamp || Date.now() / 1000,
                };
              }
            })
          );
          
          // Extract successful results
          const successfulResults = batchResults
            .filter(result => result.status === 'fulfilled')
            .map(result => result.value);
          
          processedChats.push(...successfulResults);
          
          // Calculate progress with better accuracy
          const current = Math.min(i + batchSize, totalChats);
          // حساب progress من 10% إلى 98% (10% للبداية، 98% قبل الإكمال)
          const progress = Math.max(10, Math.min(98, Math.round(10 + ((current / totalChats) * 88))));
          
          // Emit progress update more frequently for better UX
          const progressData = { 
            status: "processing", 
            message: `جاري معالجة المحادثات... (${current}/${totalChats})`,
            progress: progress,
            total: totalChats,
            current: current
          };
          
          socket.emit("syncProgress", progressData);
          // Also send as volatile to ensure delivery
          socket.volatile.emit("syncProgress", progressData);
          
          console.log(`Processed ${current}/${totalChats} chats (${progress}%)`);
          
          // Smaller delay between batches for better performance
          if (i + batchSize < chatsToProcess.length) {
            await new Promise(resolve => setTimeout(resolve, 50));
          }
        }
        
        chats = processedChats;
        console.log(`Synced ${chats.length} chats successfully`);
        
        // Emit completion with success message
        socket.emit("syncProgress", { 
          status: "completed", 
          message: `✅ تم مزامنة ${chats.length} محادثة بنجاح!`,
          progress: 100,
          total: chats.length,
          current: chats.length
        });
        
        // إرسال المحادثات بعد اكتمال المزامنة
        socket.emit("chats", chats);
        
      } catch (error) {
        console.error("Error syncing chats:", error);
        socket.emit("syncProgress", { 
          status: "error", 
          message: `حدث خطأ: ${error.message}`,
          progress: 0,
          total: 0,
          current: 0
        });
        socket.emit("chatsError", { message: error.message });
      }
    });

    // ==================== Account Management ====================
    
    // Get all accounts
    socket.on("getAccounts", () => {
      console.log("Getting accounts...");
      socket.emit("accounts", accounts);
      socket.emit("currentAccount", currentAccountId);
    });

    // Add new account
    socket.on("addAccount", ({ name }) => {
      console.log("Adding new account:", name);
      
      if (!name || !name.trim()) {
        console.log("Account name is empty, ignoring");
        return;
      }
      
      const newAccount = {
        id: `account_${Date.now()}`,
        name: name.trim(),
        phone: null,
        isActive: false
      };
      
      accounts.push(newAccount);
      saveAccounts(accounts);
      
      console.log("Account added successfully:", newAccount.id);
      socket.emit("accountAdded", newAccount);
      socket.emit("accounts", accounts);
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
        chats = [];
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
        
        console.log("Using existing session for account:", account.name);
        return;
      }
      
      // Client doesn't exist or not ready
      console.log("Client not ready, initializing...");
      
      // Reset state for new/unready account

      isReady = false;
      chats = [];
      
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
        chats = [];
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
