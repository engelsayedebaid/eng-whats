const { createServer } = require("http");
const { parse } = require("url");
const next = require("next");
const { Server } = require("socket.io");
const { Client, LocalAuth } = require("whatsapp-web.js");

const dev = process.env.NODE_ENV !== "production";
const hostname = "localhost";
const port = process.env.PORT || 3000;

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

// Multi-account support
const fs = require('fs');
const path = require('path');
const accountsFile = path.join(__dirname, 'accounts.json');

// Load accounts from file
const loadAccounts = () => {
  try {
    if (fs.existsSync(accountsFile)) {
      return JSON.parse(fs.readFileSync(accountsFile, 'utf8'));
    }
  } catch (error) {
    console.error('Error loading accounts:', error);
  }
  return [];
};

// Save accounts to file
const saveAccounts = (accounts) => {
  try {
    fs.writeFileSync(accountsFile, JSON.stringify(accounts, null, 2));
  } catch (error) {
    console.error('Error saving accounts:', error);
  }
};

// Accounts management
let accounts = loadAccounts(); // [{ id, name, phone, isActive }]
let whatsappClients = new Map(); // Map<accountId, Client>
let currentAccountId = accounts.find(a => a.isActive)?.id || null;
let chats = []; // Store chats per account
let isReady = false;

// Find Chromium executable path
const getChromiumPath = () => {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    return process.env.PUPPETEER_EXECUTABLE_PATH;
  }
  const fs = require('fs');
  const os = require('os');
  const path = require('path');
  
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

// Create WhatsApp Client function
const createWhatsAppClient = (accountId) => {
  return new Client({
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
};

// Get current active client
const getCurrentClient = () => {
  if (!currentAccountId) return null;
  return whatsappClients.get(currentAccountId);
};

// Setup client events
const setupClientEvents = (client, accountId) => {
  client.on("qr", (qr) => {
    console.log(`QR Code received for account ${accountId}`);
    if (accountId === currentAccountId) {
      io.emit("qr", qr);
    }
  });

  client.on("ready", () => {
    console.log(`WhatsApp client ${accountId} is ready!`);
    if (accountId === currentAccountId) {
      isReady = true;
      const account = accounts.find(a => a.id === accountId);
      if (account && client.info) {
        account.phone = client.info.wid.user;
        account.name = client.info.pushname || account.name;
        saveAccounts(accounts);
      }
      io.emit("status", { isReady: true });
      io.emit("ready");
      io.emit("accountsUpdated", accounts);
    }
  });

  client.on("authenticated", () => {
    console.log(`WhatsApp client ${accountId} authenticated`);
  });

  client.on("auth_failure", (msg) => {
    console.error(`Auth failure for account ${accountId}:`, msg);
    if (accountId === currentAccountId) {
      io.emit("authFailure", { message: msg });
    }
  });

  client.on("disconnected", (reason) => {
    console.log(`WhatsApp ${accountId} disconnected:`, reason);
    if (accountId === currentAccountId) {
      isReady = false;
      io.emit("status", { isReady: false });
      io.emit("disconnected", { reason });
    }
  });

  client.on("message", async (message) => {
    if (accountId === currentAccountId) {
      console.log("New message received from:", message.from);
      
      let senderName = "مجهول";
      let senderPhone = message.from.split("@")[0];
      
      try {
        const contact = await message.getContact();
        senderName = contact.pushname || contact.name || senderPhone;
      } catch (e) {
        // Ignore contact errors
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
      });
    }
  });

  client.on("message_create", async (message) => {
    if (message.fromMe && accountId === currentAccountId) {
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
    console.error(`WhatsApp client ${accountId} error:`, error);
    if (error.message && error.message.includes('Target closed')) {
      console.log(`Browser target closed for ${accountId}, attempting to reinitialize...`);
      setTimeout(() => {
        if (accountId === currentAccountId && !isReady) {
          console.log(`Reinitializing WhatsApp client ${accountId}...`);
          client.initialize().catch(err => {
            console.error(`Failed to reinitialize ${accountId}:`, err.message);
          });
        }
      }, 5000);
    }
  });
};

app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    const parsedUrl = parse(req.url, true);
    
    // API endpoints for account management
    if (parsedUrl.pathname === '/api/accounts' && req.method === 'GET') {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(accounts));
      return;
    }
    
    if (parsedUrl.pathname === '/api/accounts' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk.toString(); });
      req.on('end', () => {
        try {
          const { name } = JSON.parse(body);
          const accountId = `account_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          const newAccount = { id: accountId, name: name || `حساب ${accounts.length + 1}`, phone: null, isActive: false };
          accounts.push(newAccount);
          saveAccounts(accounts);
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ success: true, account: newAccount }));
        } catch (error) {
          res.statusCode = 400;
          res.end(JSON.stringify({ success: false, error: error.message }));
        }
      });
      return;
    }
    
    if (parsedUrl.pathname.startsWith('/api/accounts/') && req.method === 'DELETE') {
      const accountId = parsedUrl.pathname.split('/')[3];
      accounts = accounts.filter(a => a.id !== accountId);
      if (currentAccountId === accountId) {
        const client = whatsappClients.get(accountId);
        if (client) {
          client.destroy();
        }
        whatsappClients.delete(accountId);
        currentAccountId = accounts[0]?.id || null;
        isReady = false;
      } else {
        const client = whatsappClients.get(accountId);
        if (client) {
          client.destroy();
        }
        whatsappClients.delete(accountId);
      }
      saveAccounts(accounts);
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: true }));
      return;
    }
    
    if (parsedUrl.pathname.startsWith('/api/accounts/') && parsedUrl.pathname.endsWith('/switch') && req.method === 'POST') {
      const accountId = parsedUrl.pathname.split('/')[3];
      const account = accounts.find(a => a.id === accountId);
      if (account) {
        // Deactivate current account
        accounts.forEach(a => a.isActive = false);
        account.isActive = true;
        currentAccountId = accountId;
        saveAccounts(accounts);
        
        // Initialize client if not exists
        if (!whatsappClients.has(accountId)) {
          const client = createWhatsAppClient(accountId);
          setupClientEvents(client, accountId);
          whatsappClients.set(accountId, client);
          client.initialize();
        } else {
          const client = whatsappClients.get(accountId);
          if (!client.info) {
            client.initialize();
          }
        }
        
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ success: true, account }));
      } else {
        res.statusCode = 404;
        res.end(JSON.stringify({ success: false, error: 'Account not found' }));
      }
      return;
    }
    
    handle(req, res, parsedUrl);
  });

  const io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
  });

  // Socket.io connection
  io.on("connection", (socket) => {
    console.log("Client connected:", socket.id);

    // Send current status
    socket.emit("status", { isReady });

    // Send accounts list
    socket.emit("accounts", accounts);
    socket.emit("currentAccount", currentAccountId);

    // Request to fetch chats
    socket.on("getChats", async () => {
      const whatsappClient = getCurrentClient();
      if (!isReady || !whatsappClient) {
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
      const whatsappClient = getCurrentClient();
      if (!isReady || !whatsappClient) {
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
      const whatsappClient = getCurrentClient();
      if (!isReady || !whatsappClient) {
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
      const whatsappClient = getCurrentClient();
      if (!isReady || !whatsappClient) {
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
      const whatsappClient = getCurrentClient();
      if (!isReady || !whatsappClient) {
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
        let fakeProgress = 1;
        const startProgressIndicator = () => {
          const messages = [
            "جاري جلب قائمة المحادثات...",
            "يرجى الانتظار، يتم تحميل البيانات...",
            "جاري الاتصال بخوادم واتساب...",
            "يتم جلب المحادثات، قد يستغرق وقتاً...",
            "لا تغلق الصفحة، المزامنة قيد التنفيذ...",
          ];
          let msgIndex = 0;
          progressInterval = setInterval(() => {
            fakeProgress = Math.min(fakeProgress + 0.3, 30);
            const currentMsg = messages[Math.floor(msgIndex / 6) % messages.length];
            msgIndex++;
            socket.emit("syncProgress", { 
              status: "started", 
              message: currentMsg,
              progress: fakeProgress,
              total: 0,
              current: 0
            });
          }, 500);
        };
        
        startProgressIndicator();
        
        let allChats;
        try {
          console.log("Fetching chats with 120 second timeout...");
          
          // تحديث progress message
          socket.emit("syncProgress", { 
            status: "started", 
            message: "جاري جلب المحادثات... (قد يستغرق وقتاً مع عدد كبير من المحادثات)",
            progress: 5,
            total: 0,
            current: 0
          });
          
          // جلب المحادثات مع timeout 120 ثانية
          const getChatsPromise = whatsappClient.getChats();
          const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('انتهت مهلة جلب المحادثات (120 ثانية). حاول مرة أخرى أو أعد تشغيل الواتساب.')), 120000);
          });
          
          allChats = await Promise.race([getChatsPromise, timeoutPromise]);
          
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
        
        // معالجة المحادثات واحدة تلو الأخرى وإرسالها فوراً
        for (let i = 0; i < chatsToProcess.length; i++) {
          const chat = chatsToProcess[i];
          const chatName = chat.name || chat.id.user || chat.id._serialized.split("@")[0] || "محادثة";
          
          try {
            const phoneNumber = chat.id._serialized.split("@")[0];
            
            // Get profile picture (optional, skip on error with timeout) - تقليل الـ timeout
            let profilePic = null;
            try {
              const contactPromise = chat.getContact();
              const contact = await Promise.race([
                contactPromise,
                new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 1500))
              ]);
              const picPromise = contact.getProfilePicUrl();
              profilePic = await Promise.race([
                picPromise,
                new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 1000))
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
            
            const processedChat = {
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
            
            processedChats.push(processedChat);
            
          } catch (e) {
            // Return minimal data on error
            const processedChat = {
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
            processedChats.push(processedChat);
          }
          
          // حساب progress من 10% إلى 98%
          const current = i + 1;
          const progress = Math.max(10, Math.min(98, Math.round(10 + ((current / totalChats) * 88))));
          
          // إرسال الـ progress مع اسم المحادثة الحالية
          const progressData = { 
            status: "processing", 
            message: `جاري مزامنة: ${chatName} (${current}/${totalChats})`,
            progress: progress,
            total: totalChats,
            current: current
          };
          
          socket.emit("syncProgress", progressData);
          
          // إرسال المحادثات المُعالجة حتى الآن فوراً للواجهة
          socket.emit("chats", processedChats);
          
          // Log every 10 chats
          if (current % 10 === 0 || current === totalChats) {
            console.log(`Processed ${current}/${totalChats} chats (${progress}%)`);
          }
          
          // تأخير صغير جداً لتجنب حظر الـ event loop
          if (current % 5 === 0) {
            await new Promise(resolve => setTimeout(resolve, 10));
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
        
        // إرسال المحادثات النهائية
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

  // Initialize first account if exists
  if (currentAccountId) {
    const client = createWhatsAppClient(currentAccountId);
    setupClientEvents(client, currentAccountId);
    whatsappClients.set(currentAccountId, client);
    client.initialize().catch((error) => {
      console.error("Failed to initialize WhatsApp client:", error);
    });
  } else if (accounts.length === 0) {
    // Create default account if no accounts exist
    const defaultAccountId = `account_${Date.now()}`;
    const defaultAccount = { id: defaultAccountId, name: "حساب 1", phone: null, isActive: true };
    accounts.push(defaultAccount);
    currentAccountId = defaultAccountId;
    saveAccounts(accounts);
    
    const client = createWhatsAppClient(defaultAccountId);
    setupClientEvents(client, defaultAccountId);
    whatsappClients.set(defaultAccountId, client);
    client.initialize().catch((error) => {
      console.error("Failed to initialize WhatsApp client:", error);
    });
  }

  httpServer.listen(port, () => {
    console.log(`> Ready on http://${hostname}:${port}`);
  });
});
