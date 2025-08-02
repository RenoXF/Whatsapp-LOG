const { default: makeWASocket, fetchLatestBaileysVersion, useMultiFileAuthState, DisconnectReason, Browsers } = require("baileys");
const { Boom } = require("@hapi/boom");
const qrcode = require("qrcode-terminal");
// Import modules
const { testConnection, closePool } = require("./database/db");
const { handleIncomingMessage, handleReactionUpdate, handleMessageStatusUpdate } = require("./handler/message");
const { saveContactInfo, getAllContacts } = require("./handler/contact");
const { saveGroupInfo, getAllGroups, getGroupParticipants } = require("./handler/group");
const { startServer, setSocket } = require("./api"); // Import API server
// Global socket variable
let sock = null;

// Start WhatsApp Bot
const startBot = async () => {
  // Test database connection
  const dbConnected = await testConnection();
  if (!dbConnected) {
    console.error('Exiting due to database connection failure');
    process.exit(1);
  }
  
  // Setup authentication
  const { state, saveCreds } = await useMultiFileAuthState("./auth");
  const { version } = await fetchLatestBaileysVersion();
  
  // Create socket
  sock = makeWASocket({
    version,
    auth: state,
    browser: Browsers.ubuntu('Chrome'),
    markOnlineOnConnect: false,
    generateHighQualityLinkPreview: true,
    syncFullHistory: false,
    printQRInTerminal: false,
  });
  
  // Set the socket in the API
  setSocket(sock);
  
  // Save credentials when updated
  sock.ev.on("creds.update", saveCreds);
  
  // Handle connection updates
  sock.ev.on("connection.update", (update) => {
    const { connection, qr, lastDisconnect } = update;
    
    if (qr) {
      qrcode.generate(qr, { small: true });
    }
    
    if (connection === 'open') {
      console.log("✅ WhatsApp connection established!");
      console.log("📡 Listening for contact and group updates...");
    } else if (connection === 'close') {
      const shouldReconnect = (lastDisconnect?.error instanceof Boom) && 
        lastDisconnect.error.output.statusCode !== DisconnectReason.loggedOut;
      
      console.log('Connection closed due to', lastDisconnect?.error?.message || 'unknown error', 'Reconnecting:', shouldReconnect);
      
      if (shouldReconnect) {
        setTimeout(() => {
          startBot();
        }, 5000);
      } else {
        console.log("🚪 Logged out. Please restart the application.");
      }
    }
  });
  
  // Handle incoming messages
  sock.ev.on('messages.upsert', async (msg) => {
    console.log('📨 Received messages.upsert event:', msg.type, msg.messages.length, 'messages');
    
    if (msg.type === 'notify' || msg.type === 'append') {
      for (const message of msg.messages) {
        console.log('📝 Processing message:', {
          id: message.key.id,
          fromMe: message.key.fromMe,
          remoteJid: message.key.remoteJid,
          messageType: Object.keys(message.message || {})[0] || "unknown"
        });
        
        try {
          await handleIncomingMessage(message, sock);
          console.log('✅ Successfully processed message:', message.key.id);
        } catch (error) {
          console.error('❌ Error processing message:', message.key.id, error);
        }
      }
    } else {
      console.log('⚠️ Ignoring message type:', msg.type);
    }
  });
  
  // Handle message reactions
  sock.ev.on('messages.reaction', async (reactionData) => {
    try {
      console.log('📨 Received messages.reaction event');
      
      // Handle the structure we're seeing: array with numeric index '0'
      if (reactionData['0'] && reactionData['0'].key && reactionData['0'].reaction) {
        console.log('📝 Processing reaction from array index 0');
        const reaction = reactionData['0'];
        
        // Extract the timestamp from the Long object
        let timestamp;
        if (reaction.reaction.senderTimestampMs) {
          // Handle Long object - convert to number
          timestamp = reaction.reaction.senderTimestampMs.toNumber();
        } else if (reaction.reaction.timestamp) {
          timestamp = reaction.reaction.timestamp;
        } else {
          console.error('❌ Missing timestamp in reaction:', reaction);
          return;
        }
        
        // Create a standardized reaction object
        const standardizedReaction = {
          key: reaction.key,
          text: reaction.reaction.text,
          timestamp: timestamp
        };
        
        await handleReactionUpdate(standardizedReaction);
      }
      // Handle other possible structures if needed
      else if (reactionData.key && reactionData.text) {
        console.log('📝 Processing single reaction:', reactionData);
        await handleReactionUpdate(reactionData);
      }
      else {
        console.error('❌ Unknown reaction data structure:', JSON.stringify(reactionData, null, 2));
      }
    } catch (error) {
      console.error('❌ Error handling reactions:', error);
      console.error('Reaction data:', JSON.stringify(reactionData, null, 2));
    }
  });
  
  // Handle message status updates (delivery/read receipts)
  sock.ev.on('message-receipt.update', async (updates) => {
    console.log('📨 Received message-receipt.update event:', updates.length, 'updates');
    
    for (const update of updates) {
      console.log('📊 Processing status update:', {
        messageId: update.key?.id,
        remoteJid: update.key?.remoteJid,
        participant: update.key?.participant,
        receiptUserJid: update.receipt?.userJid,
        receiptReadTimestamp: update.receipt?.readTimestamp,
        receiptTimestamp: update.receipt?.receiptTimestamp,
        receiptType: update.receipt?.type,
        fullUpdate: JSON.stringify(update, null, 2)
      });
      
      await handleMessageStatusUpdate(update);
    }
  });

  // Enhanced contact information handler
  sock.ev.on('contacts.update', async (contacts) => {
    console.log('📨 Received contacts.update event:', contacts.length, 'contacts');
    
    for (const contact of contacts) {
      console.log('📊 Processing contact update:', {
        id: contact.id,
        name: contact.name || contact.notify || contact.id,
        verified: contact.verified,
        business: contact.business,
        imgUrl: contact.imgUrl,
        status: contact.status,
        fullUpdate: JSON.stringify(contact, null, 2)
      });
      
      try {
        // Create comprehensive contact object
        const contactData = {
          jid: contact.id,
          name: contact.name || null,
          notify: contact.notify || null,
          verifiedName: contact.verifiedName || null,
          imgUrl: contact.imgUrl || null,
          status: contact.status || null,
          isBusiness: contact.isBusiness || contact.business || false,
          isEnterprise: contact.isEnterprise || false,
          verified: contact.verified || false,
          inPhoneBook: contact.inPhoneBook || false,
          known: contact.known || false,
          profilePicUrl: contact.profilePicUrl || null,
          lastSeen: contact.lastSeen || null,
          about: contact.about || null,
          // Additional fields that might be available
          shortName: contact.shortName || null,
          pushName: contact.pushName || null,
          formattedName: contact.formattedName || null,
          vname: contact.vname || null,
          labels: contact.labels || [],
          // Metadata
          lastUpdated: new Date().toISOString()
        };
        
        await saveContactInfo(contactData);
        console.log('✅ Successfully saved contact:', contact.id);
      } catch (error) {
        console.error('❌ Error saving contact:', contact.id, error);
      }
    }
  });

  // Rate limiting configuration
  const GROUP_METADATA_DELAY = 1000; // 1 second between requests
  const MAX_RETRIES = 3;

  // Queue for group metadata requests
  const groupMetadataQueue = [];
  let isProcessingQueue = false;

  // Process group metadata queue with rate limiting
  const processGroupMetadataQueue = async () => {
    if (isProcessingQueue || groupMetadataQueue.length === 0) return;
    
    isProcessingQueue = true;
    
    while (groupMetadataQueue.length > 0) {
      const { groupId, callback } = groupMetadataQueue.shift();
      
      try {
        // Use retry logic with exponential backoff
        const groupMetadata = await retryWithBackoff(
          async () => {
            return await sock.groupMetadata(groupId);
          },
          MAX_RETRIES,
          GROUP_METADATA_DELAY
        );
        
        await callback(groupMetadata);
        
        // Add delay between requests
        await new Promise(resolve => setTimeout(resolve, GROUP_METADATA_DELAY));
      } catch (error) {
        console.error(`❌ Failed to fetch metadata for group ${groupId} after ${MAX_RETRIES} attempts:`, error);
        
        // Still call the callback with null to continue processing
        await callback(null);
      }
    }
    
    isProcessingQueue = false;
  };

  // Retry function with exponential backoff
  const retryWithBackoff = async (fn, maxRetries = 3, baseDelay = 1000) => {
    let retryCount = 0;
    
    while (retryCount < maxRetries) {
      try {
        return await fn();
      } catch (error) {
        retryCount++;
        
        if (retryCount >= maxRetries) {
          throw error;
        }
        
        // Check if it's a rate limit error
        if (error.data === 429 || error.message?.includes('rate-overlimit')) {
          const delay = baseDelay * Math.pow(2, retryCount - 1);
          console.log(`⚠️ Rate limit hit, retrying in ${delay}ms (attempt ${retryCount}/${maxRetries})`);
          await new Promise(resolve => setTimeout(resolve, delay));
        } else {
          // For other errors, don't retry
          throw error;
        }
      }
    }
  };

  // Enhanced group information handler
  sock.ev.on('groups.update', async (groups) => {
    console.log('📨 Received groups.update event:', groups.length, 'groups');
    
    for (const group of groups) {
      // Skip if we don't have a valid group ID
      if (!group.id) {
        console.warn('⚠️ Group missing ID, skipping:', group);
        continue;
      }
      
      console.log('📊 Processing group update:', {
        id: group.id,
        name: group.subject,
        participants: group.participants?.length || 0,
        fullUpdate: JSON.stringify(group, null, 2)
      });
      
      // Add to queue instead of processing immediately
      groupMetadataQueue.push({
        groupId: group.id,
        callback: async (groupMetadata) => {
          if (!groupMetadata) {
            console.log(`⚠️ Skipping group ${group.id} due to metadata fetch failure`);
            return;
          }
          
          try {
            // Skip if metadata doesn't have an ID
            if (!groupMetadata.id) {
              console.warn('⚠️ Group metadata missing ID, skipping:', groupMetadata);
              return;
            }
            
            // Create comprehensive group object
            const groupData = {
              group_id: groupMetadata.id,
              group_name: groupMetadata.subject,
              creation: groupMetadata.creation || null,
              owner: groupMetadata.owner || null,
              desc: groupMetadata.desc || null,
              descId: groupMetadata.descId || null,
              restrict: groupMetadata.restrict || false,
              announce: groupMetadata.announce || false,
              participants: groupMetadata.participants || [],
              size: groupMetadata.participants?.length || 0,
              isCommunity: groupMetadata.isCommunity || false,
              isParentGroup: groupMetadata.isParentGroup || false,
              parentGroupId: groupMetadata.parentGroupId || null,
              linkedParentGroups: groupMetadata.linkedParentGroups || [],
              ephemeralDuration: groupMetadata.ephemeralDuration || null,
              ephemeralSettingTimestamp: groupMetadata.ephemeralSettingTimestamp || null,
              lastUpdated: new Date().toISOString()
            };
            
            await saveGroupInfo(groupData, sock);
            console.log('✅ Successfully saved group:', group.id);
          } catch (error) {
            console.error('❌ Error saving group:', group.id, error);
          }
        }
      });
    }
    
    // Start processing the queue
    processGroupMetadataQueue();
  });

  // Group participant updates
  sock.ev.on('group-participants.update', async (update) => {
    try {
      console.log('📨 Received group-participants.update event:', {
        id: update.id,
        action: update.action,
        participants: update.participants
      });
      
      // Add to queue instead of processing immediately
      groupMetadataQueue.push({
        groupId: update.id,
        callback: async (groupMetadata) => {
          if (!groupMetadata) {
            console.log(`⚠️ Skipping group ${update.id} due to metadata fetch failure`);
            return;
          }
          
          try {
            // Save updated group information
            const groupData = {
              group_id: groupMetadata.id,
              group_name: groupMetadata.subject,
              creation: groupMetadata.creation || null,
              owner: groupMetadata.owner || null,
              desc: groupMetadata.desc || null,
              descId: groupMetadata.descId || null,
              restrict: groupMetadata.restrict || false,
              announce: groupMetadata.announce || false,
              participants: groupMetadata.participants || [],
              size: groupMetadata.participants?.length || 0,
              isCommunity: groupMetadata.isCommunity || false,
              isParentGroup: groupMetadata.isParentGroup || false,
              parentGroupId: groupMetadata.parentGroupId || null,
              linkedParentGroups: groupMetadata.linkedParentGroups || [],
              ephemeralDuration: groupMetadata.ephemeralDuration || null,
              ephemeralSettingTimestamp: groupMetadata.ephemeralSettingTimestamp || null,
              lastUpdated: new Date().toISOString()
            };
            
            await saveGroupInfo(groupData, sock);
            console.log(`✅ Updated group after participant change: ${update.id}`);
            
            // Log updated participant count
            const participants = await getGroupParticipants(update.id);
            console.log(`👥 Group now has ${participants.length} participants`);
          } catch (error) {
            console.error('❌ Error handling group participants update:', error);
          }
        }
      });
      
      // Start processing the queue
      processGroupMetadataQueue();
    } catch (error) {
      console.error('❌ Error handling group participants update:', error);
    }
  });
};

// Start the bot
startBot().catch(err => console.error('Connection error:', err));

// Start the API server
startServer();

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\nShutting down WhatsApp logger...');
  
  if (sock && sock.ws) {
    try {
      sock.ws.close();
      sock.ev.removeAllListeners();
    } catch (error) {
      console.error('Error during shutdown:', error);
    }
  }
  
  try {
    await closePool();
  } catch (error) {
    console.error('Error closing database pool:', error);
  }
  
  process.exit(0);
});

// Handle unhandled rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});