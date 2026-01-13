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

// In-memory store for chats
let chats = [];
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

// WhatsApp Client
const whatsappClient = new Client({
  authStrategy: new LocalAuth(),
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
    // Add timeout and ignore errors
    timeout: 60000,
    ignoreHTTPSErrors: true,
  },
});

app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    const parsedUrl = parse(req.url, true);
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
        socket.emit("chatsError", { message: "WhatsApp not ready" });
        return;
      }

      try {
        console.log("Syncing all chats...");
        
        // Emit sync started
        socket.emit("syncProgress", { 
          status: "started", 
          message: "جاري جلب المحادثات...",
          progress: 0,
          total: 0,
          current: 0
        });
        
        const allChats = await whatsappClient.getChats();
        // لا يوجد حد أقصى - معالجة جميع المحادثات
        const totalChats = maxChats ? Math.min(allChats.length, maxChats) : allChats.length;
        console.log(`Found ${allChats.length} chats, processing all ${totalChats}...`);
        
        socket.emit("syncProgress", { 
          status: "processing", 
          message: `تم العثور على ${allChats.length} محادثة، جاري المعالجة...`,
          progress: 2,
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
          const progress = Math.max(2, Math.min(98, Math.round((current / totalChats) * 98)));
          
          // Emit progress update more frequently for better UX
          socket.emit("syncProgress", { 
            status: "processing", 
            message: `جاري معالجة المحادثات... (${current}/${totalChats})`,
            progress: progress,
            total: totalChats,
            current: current
          });
          
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

    socket.on("disconnect", () => {
      console.log("Client disconnected:", socket.id);
    });
  });

  // WhatsApp events
  whatsappClient.on("qr", (qr) => {
    console.log("QR Code received");
    io.emit("qr", qr);
  });

  whatsappClient.on("ready", () => {
    console.log("WhatsApp client is ready!");
    isReady = true;
    io.emit("status", { isReady: true });
    io.emit("ready");
  });

  whatsappClient.on("authenticated", () => {
    console.log("WhatsApp client authenticated");
  });

  whatsappClient.on("auth_failure", (msg) => {
    console.error("Auth failure:", msg);
    io.emit("authFailure", { message: msg });
  });

  whatsappClient.on("disconnected", (reason) => {
    console.log("WhatsApp disconnected:", reason);
    isReady = false;
    io.emit("status", { isReady: false });
    io.emit("disconnected", { reason });
  });

  whatsappClient.on("message", async (message) => {
    console.log("New message received from:", message.from);
    
    // Get sender info
    let senderName = "مجهول";
    let senderPhone = message.from.split("@")[0];
    
    try {
      const contact = await message.getContact();
      senderName = contact.pushname || contact.name || senderPhone;
    } catch (e) {
      // Ignore contact errors
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

  // Also listen for outgoing messages
  whatsappClient.on("message_create", async (message) => {
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

  // Error handlers for unhandled rejections
  process.on('unhandledRejection', (error) => {
    console.error('Unhandled Rejection:', error);
    // Don't crash the server, just log the error
    if (error.message && error.message.includes('Target closed')) {
      console.log('Browser target closed, this is usually harmless');
    }
  });

  process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    // Don't crash the server, just log the error
  });

  // WhatsApp client error handlers
  whatsappClient.on("error", (error) => {
    console.error("WhatsApp client error:", error);
    // Don't crash, just log
    if (error.message && error.message.includes('Target closed')) {
      console.log('Browser target closed, attempting to reinitialize...');
      // Optionally reinitialize after a delay
      setTimeout(() => {
        if (!isReady) {
          console.log('Reinitializing WhatsApp client...');
          whatsappClient.initialize().catch(err => {
            console.error('Failed to reinitialize:', err.message);
          });
        }
      }, 5000);
    }
  });

  // Initialize WhatsApp client with error handling
  whatsappClient.initialize().catch((error) => {
    console.error("Failed to initialize WhatsApp client:", error);
    if (error.message && error.message.includes('Target closed')) {
      console.log('Browser target closed during initialization, this may be temporary');
    }
  });

  httpServer.listen(port, () => {
    console.log(`> Ready on http://${hostname}:${port}`);
  });
});
