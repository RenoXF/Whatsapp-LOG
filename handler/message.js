const { pool } = require('../database/db');
const { saveMedia, saveContactVCard, getMediaFileInfo, isMediaAvailable } = require("./media");

// Device detection with regex patterns
function detectSenderDeviceType(message) {
  const id = message?.key?.id || "";
  return /^3A.{18}$/.test(id)
    ? "iOS"
    : /^3E.{20}$/.test(id)
    ? "Web"
    : /^(.{21}|.{32})$/.test(id)
    ? "Android"
    : /^(3F|.{18}$)/.test(id)
    ? "Desktop"
    : "Unknown";
}

// Format date to MySQL datetime
function formatToMySQLDatetime(date) {
  const pad = n => n < 10 ? '0' + n : n;
  return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function getFormattedTimestamp(timestamp) {
  if (!timestamp || isNaN(timestamp)) return null;

  const date = new Date(timestamp * 1000);
  if (isNaN(date.getTime())) return null;

  return formatToMySQLDatetime(date);
}

// Handle incoming and outgoing message
async function handleIncomingMessage(message, sock = null) {
  try {
    const deviceType = detectSenderDeviceType(message);
    const messageType = Object.keys(message.message || {})[0] || "unknown";
    const timestamp = message.messageTimestamp || Date.now();
    const formattedTime = formatToMySQLDatetime(new Date(timestamp * 1000));
    
    // Determine sender name based on message direction
    let senderName;
    if (message.key.fromMe) {
      // For outgoing messages, use the user's name from the socket
      senderName = sock?.user?.name || sock?.user?.verifiedName || "Me";
    } else {
      // For incoming messages, use the contact's name
      senderName = message.pushName || "Tidak diketahui";
    }
    
    const sender = message.key.remoteJid || "unknown";
    const messageId = message.key.id;
    const isFromMe = message.key.fromMe || false;
    
    let text = null;
    let mediaPath = null;
    let mediaCaption = null;
    let mediaMimeType = null;
    let mediaSize = null;
    let mediaDuration = null;
    let mediaWidth = null;
    let mediaHeight = null;
    
    // Handle different message types
    if (message.message?.conversation) {
      text = message.message.conversation;
    } else if (message.message?.extendedTextMessage?.text) {
      text = message.message.extendedTextMessage.text;
    } else if (message.message?.imageMessage) {
      if (isMediaAvailable(message, 'image')) {
        const mediaResult = await handleMediaMessage(message, 'image');
        if (mediaResult) {
          text = mediaResult.text;
          mediaPath = mediaResult.mediaPath;
          mediaCaption = mediaResult.mediaCaption;
          mediaMimeType = mediaResult.mediaMimeType;
          mediaWidth = mediaResult.mediaWidth;
          mediaHeight = mediaResult.mediaHeight;
        }
      } else {
        text = 'Image (media not available)';
      }
    } else if (message.message?.videoMessage) {
      if (isMediaAvailable(message, 'video')) {
        const mediaResult = await handleMediaMessage(message, 'video');
        if (mediaResult) {
          text = mediaResult.text;
          mediaPath = mediaResult.mediaPath;
          mediaCaption = mediaResult.mediaCaption;
          mediaMimeType = mediaResult.mediaMimeType;
          mediaDuration = mediaResult.mediaDuration;
        }
      } else {
        text = 'Video (media not available)';
      }
    } else if (message.message?.audioMessage) {
      if (isMediaAvailable(message, 'audio')) {
        const mediaResult = await handleMediaMessage(message, 'audio');
        if (mediaResult) {
          text = mediaResult.text;
          mediaPath = mediaResult.mediaPath;
          mediaMimeType = mediaResult.mediaMimeType;
          mediaDuration = mediaResult.mediaDuration;
        }
      } else {
        text = 'Audio (media not available)';
      }
    } else if (message.message?.documentMessage) {
      if (isMediaAvailable(message, 'document')) {
        const mediaResult = await handleMediaMessage(message, 'document');
        if (mediaResult) {
          text = mediaResult.text;
          mediaPath = mediaResult.mediaPath;
          mediaMimeType = mediaResult.mediaMimeType;
          mediaSize = mediaResult.mediaSize;
        }
      } else {
        text = 'Document (media not available)';
      }
    } else if (message.message?.stickerMessage) {
      if (isMediaAvailable(message, 'sticker')) {
        const mediaResult = await handleMediaMessage(message, 'sticker');
        if (mediaResult) {
          text = mediaResult.text;
          mediaPath = mediaResult.mediaPath;
          mediaMimeType = mediaResult.mediaMimeType;
        }
      } else {
        text = 'Sticker (media not available)';
      }
    } else if (message.message?.locationMessage) {
      const loc = message.message.locationMessage;
      if (loc && loc.degreesLatitude && loc.degreesLongitude) {
        text = `Location: ${loc.degreesLatitude}, ${loc.degreesLongitude}`;
      }
    } else if (message.message?.contactMessage) {
      try {
        const contactInfo = await saveContactVCard(message.message.contactMessage);
        if (contactInfo) {
          text = `Contact: ${contactInfo.fileName}`;
          mediaPath = contactInfo.relativePath;
        }
      } catch (error) {
    console.error('Unexpected error in handleIncomingMessage:', error);
  }
    }
    
    // Save to database if we have content
        if (text) {
      // Check if message already exists
      const exists = await messageExists(messageId);
      
      if (exists) {
        console.log(`⚠️ Message ${messageId} already exists in database, skipping`);
        return;
      }
      try {
        await pool.query(
          `INSERT INTO messages 
          (message_id, sender_name, sender, message, message_type, time, device, 
           media_path, media_caption, media_mime_type, media_size, media_duration, 
           media_width, media_height, quoted_message_id, forwarded, from_me) 
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            messageId, 
            senderName, 
            sender, 
            text, 
            messageType, 
            formattedTime, 
            deviceType,
            mediaPath,
            mediaCaption,
            mediaMimeType,
            mediaSize,
            mediaDuration,
            mediaWidth,
            mediaHeight,
            message.message?.extendedTextMessage?.contextInfo?.stanzaId || null,
            message.message?.extendedTextMessage?.contextInfo?.isForwarded || false,
            isFromMe
          ]
        );

        // log forwarded message
        if (message.message?.extendedTextMessage?.contextInfo?.isForwarded) {
          console.log(`Pesan diteruskan dari ${senderName} (${sender}): ${text}`);
        } else {
        const direction = isFromMe ? "sent" : "received";
        console.log(`Pesan ${direction} dari ${senderName} (${sender}) disimpan: ${text}`);
        }
      } catch (err) {
        console.error(`❌ Gagal menyimpan pesan dari ${sender}:`, err.message);
      }
    }
  } catch (error) {
    console.error('Unexpected error in handleIncomingMessage:', error);
  }
}

// Handle message reactions
async function handleReactionUpdate(reaction) {
  try {
    // Validate the reaction structure
    if (!reaction) {
      console.error('❌ Empty reaction object');
      return;
    }
    
    if (!reaction.key) {
      console.error('❌ Missing key in reaction:', reaction);
      return;
    }
    
    if (!reaction.key.id) {
      console.error('❌ Missing message ID in reaction:', reaction);
      return;
    }
    
    // Get the reaction text (handle different possible field names)
    const reactionText = reaction.text || reaction.reaction || reaction.emoji;
    if (!reactionText) {
      console.error('❌ Missing reaction text in reaction:', reaction);
      return;
    }
    
    // Get the timestamp (handle different possible field names and types)
    let timestamp;
    if (reaction.timestamp) {
      // Check if it's a Long object
      timestamp = typeof reaction.timestamp.toNumber === 'function' 
        ? reaction.timestamp.toNumber() 
        : reaction.timestamp;
    } else if (reaction.senderTimestampMs) {
      // Check if it's a Long object
      timestamp = typeof reaction.senderTimestampMs.toNumber === 'function' 
        ? reaction.senderTimestampMs.toNumber() 
        : reaction.senderTimestampMs;
    } else if (reaction.reactionTimestamp) {
      timestamp = typeof reaction.reactionTimestamp.toNumber === 'function' 
        ? reaction.reactionTimestamp.toNumber() 
        : reaction.reactionTimestamp;
    } else if (reaction.timestampMs) {
      timestamp = typeof reaction.timestampMs.toNumber === 'function' 
        ? reaction.timestampMs.toNumber() 
        : reaction.timestampMs;
    } else {
      console.error('❌ Missing timestamp in reaction:', reaction);
      return;
    }
    
    // Determine if the timestamp is in seconds or milliseconds
    // If it's a very large number (greater than 10000000000), it's likely in milliseconds
    if (timestamp > 10000000000) {
      timestamp = Math.floor(timestamp / 1000);
    }
    
    // Get the participant JID
    const participantJid = reaction.key.participant || reaction.key.remoteJid || reaction.from;
    if (!participantJid) {
      console.error('❌ Missing participant JID in reaction:', reaction);
      return;
    }
    
    // Format the timestamp
    const formattedTime = formatToMySQLDatetime(new Date(timestamp * 1000));
    
    // Insert into database
    await pool.query(
      `INSERT INTO message_reactions 
      (message_id, from_jid, reaction_text, timestamp) 
      VALUES (?, ?, ?, ?)`,
      [
        reaction.key.id,
        participantJid,
        reactionText,
        formattedTime
      ]
    );
    
    console.log(`✅ Reaction saved for message ${reaction.key.id}: ${reactionText} by ${participantJid}`);
  } catch (error) {
    console.error('❌ Error saving reaction:', error);
    console.error('Reaction data:', JSON.stringify(reaction, null, 2));
  }
}

// Check if a message exists in the database
const messageExists = async (messageId) => {
  try {
    const [rows] = await pool.query(
      'SELECT message_id FROM messages WHERE message_id = ?',
      [messageId]
    );
    return rows.length > 0;
  } catch (error) {
    console.error('❌ Error checking message existence:', messageId, error);
    return false;
  }
};

// Handle message status updates (delivery/read receipts)
const handleMessageStatusUpdate = async (update) => {
  try {
    console.log('📨 Processing single status update:', {
      messageId: update.key?.id,
      remoteJid: update.key?.remoteJid,
      participant: update.key?.participant,
      receiptUserJid: update.receipt?.userJid,
      receiptReadTimestamp: update.receipt?.readTimestamp,
      receiptTimestamp: update.receipt?.receiptTimestamp,
      receiptType: update.receipt?.type,
      fullUpdate: JSON.stringify(update, null, 2)
    });
    
    // Get the message ID
    const messageId = update.key?.id;
    if (!messageId) {
      console.warn('⚠️ Missing message ID in receipt, skipping');
      return;
    }
    
    // Check if the message exists
    const exists = await messageExists(messageId);
    if (!exists) {
      console.log(`⚠️ Message ${messageId} not found in database, skipping status update`);
      return;
    }
    
    // Determine the status type with proper validation
    let status = 'unknown';
    if (update.receipt?.type === 'read') {
      status = 'read';
    } else if (update.receipt?.type === 'delivery') {
      status = 'delivered';
    } else if (update.receipt?.type === 'sent') {
      status = 'sent';
    } else if (update.receipt?.type === 'error') {
      status = 'failed';
    }
    
    // Validate status length
    if (status.length > 20) {
      console.warn(`⚠️ Status value too long: ${status}, truncating to 20 characters`);
      status = status.substring(0, 20);
    }
    
    // Get the timestamp
    let timestamp = null;
    if (update.receipt?.readTimestamp) {
      timestamp = new Date(update.receipt.readTimestamp * 1000).toISOString().slice(0, 19).replace('T', ' ');
    } else if (update.receipt?.receiptTimestamp) {
      timestamp = new Date(update.receipt.receiptTimestamp * 1000).toISOString().slice(0, 19).replace('T', ' ');
    }
    
    try {
      // Save the status update
      await pool.query(
        'INSERT INTO message_status (message_id, to_jid, status, timestamp) VALUES (?, ?, ?, ?)',
        [
          messageId,
          update.key?.remoteJid,
          status,
          timestamp
        ]
      );
      
      console.log(`✅ Saved status for message ${messageId}: ${status}`);
    } catch (error) {
      // Handle specific database errors
      if (error.code === 'ER_DATA_TOO_LONG') {
        console.error(`❌ Data too long for status column: ${status}`);
        
        // Try with a truncated status
        const truncatedStatus = status.substring(0, 10);
        try {
          await pool.query(
            'INSERT INTO message_status (message_id, to_jid, status, timestamp) VALUES (?, ?, ?, ?)',
            [
              messageId,
              update.key?.remoteJid,
              truncatedStatus,
              timestamp
            ]
          );
          
          console.log(`✅ Saved truncated status for message ${messageId}: ${truncatedStatus}`);
        } catch (retryError) {
          console.error('❌ Failed to save even with truncated status:', retryError);
        }
      } else {
        console.error('❌ Error saving message status:', error);
      }
    }
  } catch (error) {
    console.error('❌ Error handling message status update:', error);
  }
};

// Test function to manually check message status
async function testMessageStatus() {
  try {
    // Get the most recent message
    const results = await pool.query(
      'SELECT message_id, sender FROM messages ORDER BY time DESC LIMIT 1'
    );
    
    if (results.length > 0) {
      const message = results[0];
      console.log(`🔍 Testing status for message: ${message.message_id} from ${message.sender}`);
      
      // Simulate a status update
      const testUpdate = {
        key: {
          id: message.message_id,
          remoteJid: message.sender
        },
        receipt: {
          type: 'read',
          timestamp: Math.floor(Date.now() / 1000)
        }
      };
      
      await handleMessageStatusUpdate(testUpdate);
    } else {
      console.log('🔍 No messages found in database');
    }
  } catch (error) {
    console.error('Error testing message status:', error);
  }
}

// Handle group read receipts
async function handleGroupReadReceipt(update) {
  try {
    if (!update.key || !update.key.id) {
      console.error('❌ Invalid group read receipt:', update);
      return;
    }
    
    if (!update.receipt) {
      console.error('❌ Missing receipt in group read receipt:', update);
      return;
    }
    
    // Check for different timestamp field names
    const timestamp = update.receipt.readTimestamp || update.receipt.receiptTimestamp;
    if (!timestamp) {
      console.error('❌ Missing timestamp in group read receipt:', update);
      return;
    }
    
    // Check for different user JID field names
    const userJid = update.receipt.userJid || update.receipt.participantJid;
    if (!userJid) {
      console.error('❌ Missing userJid in group read receipt:', update);
      return;
    }
    
    // Check if the message exists in the database
    const exists = await messageExists(update.key.id);
    if (!exists) {
      console.log(`⚠️ Message ${update.key.id} not found in database, skipping status update`);
      return;
    }
    
    const formattedTime = formatToMySQLDatetime(new Date(timestamp * 1000));
    
    // Insert into database
    await pool.query(
      `INSERT INTO message_status 
      (message_id, to_jid, status, timestamp) 
      VALUES (?, ?, ?, ?)`,
      [
        update.key.id,
        userJid,
        'read',
        formattedTime
      ]
    );
    
    console.log(`✅ Group read status saved for message ${update.key.id} by ${userJid} at ${formattedTime}`);
  } catch (error) {
    console.error('❌ Error saving group read receipt:', error);
  }
}

// Handle media messages with better error handling
async function handleMediaMessage(message, messageType) {
  try {
    const fileInfo = getMediaFileInfo(message);
    if (!fileInfo) {
      console.error('File info is null for message:', message.key.id);
      return null;
    }
    
    let mediaInfo = null;
    try {
      mediaInfo = await saveMedia(message, fileInfo.type, fileInfo.ext);
    } catch (error) {
      console.error('Error saving media for message:', message.key.id, error);
    }
    
    let text = `${fileInfo.type.charAt(0).toUpperCase() + fileInfo.type.slice(1)}`;
    if (mediaInfo) {
      text += `: ${mediaInfo.fileName}`;
    } else {
      text += ' (media not available)';
    }
    
    // Add caption if available
    if (fileInfo.caption) {
      text += `\nCaption: ${fileInfo.caption}`;
    }
    
    return {
      text,
      mediaPath: mediaInfo ? mediaInfo.relativePath : null,
      mediaCaption: fileInfo.caption || null,
      mediaMimeType: fileInfo.mimeType || null,
      mediaSize: fileInfo.fileSize || null,
      mediaDuration: fileInfo.duration || null,
      mediaWidth: fileInfo.width || null,
      mediaHeight: fileInfo.height || null
    };
  } catch (error) {
    console.error(`Error handling ${messageType} message:`, error);
    return null;
  }
}

// Validate and log reaction event structure
function logReactionStructure(reactionData) {
  console.log('🔍 Reaction data structure analysis:');
  
  if (typeof reactionData !== 'object') {
    console.log('  - Type:', typeof reactionData);
    return;
  }
  
  console.log('  - Keys:', Object.keys(reactionData));
  
  // Check for numeric indices (like '0')
  const numericKeys = Object.keys(reactionData).filter(key => !isNaN(key));
  if (numericKeys.length > 0) {
    console.log('  - Numeric keys:', numericKeys);
    // Log the structure of the first numeric key
    const firstKey = numericKeys[0];
    console.log('  - Structure of', firstKey + ':', Object.keys(reactionData[firstKey] || {}));
    
    // Check if it has a reaction property
    if (reactionData[firstKey] && reactionData[firstKey].reaction) {
      console.log('  - Has reaction property with keys:', Object.keys(reactionData[firstKey].reaction));
      
      // Check for timestamp properties
      if (reactionData[firstKey].reaction.senderTimestampMs) {
        console.log('  - Has senderTimestampMs (type):', typeof reactionData[firstKey].reaction.senderTimestampMs);
        if (typeof reactionData[firstKey].reaction.senderTimestampMs.toNumber === 'function') {
          console.log('  - senderTimestampMs value:', reactionData[firstKey].reaction.senderTimestampMs.toNumber());
        }
      }
    }
  }
  
  if (reactionData.reactions) {
    console.log('  - Has reactions:', Array.isArray(reactionData.reactions) ? 'array' : typeof reactionData.reactions);
    if (Array.isArray(reactionData.reactions) && reactionData.reactions.length > 0) {
      console.log('  - First reaction keys:', Object.keys(reactionData.reactions[0]));
    }
  }
  
  if (reactionData.key) {
    console.log('  - Has key:', Object.keys(reactionData.key));
  }
  
  if (reactionData.text) {
    console.log('  - Has text:', reactionData.text);
  }
  
  if (reactionData.message) {
    console.log('  - Has message:', Object.keys(reactionData.message));
  }
}

module.exports = {
  handleIncomingMessage,
  handleReactionUpdate,
  handleMessageStatusUpdate,
  handleGroupReadReceipt,
  testMessageStatus,
  logReactionStructure
};