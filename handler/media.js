const fs = require("fs");
const path = require("path");
const { promisify } = require("util");
const { downloadMediaMessage } = require("baileys");
const pipeline = promisify(require("stream").pipeline);

// Save media to folder
async function saveMedia(message, type, ext) {
  try {
    // Check if the message has the required media key
    if (!message.key || !message.key.id) {
      console.error('Invalid message key for media download:', message.key);
      return null;
    }

    // Check if the message has the required media content
    if (!message.message || !message.message[type + 'Message']) {
      console.error(`Missing ${type}Message in message:`, message.key.id);
      return null;
    }

    // Check if the media has the required keys
    const mediaMessage = message.message[type + 'Message'];
    if (!mediaMessage.mediaKey && !mediaMessage.fileSha256 && !mediaMessage.url) {
      console.log(`⚠️ Media keys not available for message ${message.key.id} (possibly expired or forwarded without keys)`);
      return null;
    }

    const stream = await downloadMediaMessage(message, { 
      upload: require("baileys").default.waUploadToServer 
    });
    
    const fileName = `${type}_${Date.now()}.${ext}`;
    const dir = path.join(__dirname, 'media', type);
    
    // Create directory if it doesn't exist
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    const filePath = path.join(dir, fileName);
    await pipeline(stream, fs.createWriteStream(filePath));
    
    return {
      fileName: fileName,
      filePath: filePath,
      relativePath: path.join('media', type, fileName)
    };
  } catch (error) {
    // Handle specific media key error
    if (error.message && error.message.includes('Cannot derive from empty media key')) {
      console.log(`⚠️ Media not available for message ${message.key.id} (possibly expired or deleted)`);
    } else if (error.message && error.message.includes('404')) {
      console.log(`⚠️ Media not found on server for message ${message.key.id}`);
    } else {
      console.error('Error saving media:', error);
    }
    return null;
  }
}

// Save contact vCard
async function saveContactVCard(contactMessage) {
  try {
    const vcard = contactMessage.vcard;
    const fileName = `contact_${Date.now()}.vcf`;
    const dir = path.join(__dirname, 'media', 'contact');
    
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    const filePath = path.join(dir, fileName);
    fs.writeFileSync(filePath, vcard);
    
    return {
      fileName: fileName,
      filePath: filePath,
      relativePath: path.join('media', 'contact', fileName)
    };
  } catch (error) {
    console.error('Error saving contact vCard:', error);
    return null;
  }
}

// Get media file info
function getMediaFileInfo(message) {
  if (!message || !message.message) {
    console.error('Invalid message structure');
    return null;
  }
  
  const messageType = Object.keys(message.message)[0];
  if (!messageType || !message.message[messageType]) {
    console.error(`Unknown or empty message type: ${messageType}`);
    return null;
  }
  
  switch (messageType) {
    case 'imageMessage':
      return {
        type: 'image',
        ext: 'jpg',
        caption: message.message.imageMessage.caption || '',
        mimeType: message.message.imageMessage.mimetype,
        width: message.message.imageMessage.width,
        height: message.message.imageMessage.height
      };
      
    case 'videoMessage':
      return {
        type: 'video',
        ext: 'mp4',
        caption: message.message.videoMessage.caption || '',
        mimeType: message.message.videoMessage.mimetype,
        duration: message.message.videoMessage.seconds
      };
      
    case 'audioMessage':
      return {
        type: 'audio',
        ext: 'opus',
        mimeType: message.message.audioMessage.mimetype,
        duration: message.message.audioMessage.seconds
      };
      
    case 'documentMessage':
      const mimeParts = (message.message.documentMessage.mimetype || '').split('/');
      return {
        type: 'document',
        ext: mimeParts[1] || 'bin',
        fileName: message.message.documentMessage.fileName || 'document',
        mimeType: message.message.documentMessage.mimetype,
        fileSize: message.message.documentMessage.fileLength
      };
      
    case 'stickerMessage':
      return {
        type: 'sticker',
        ext: 'webp',
        mimeType: message.message.stickerMessage.mimetype
      };
      
    case 'contactMessage':
      return {
        type: 'contact',
        ext: 'vcf',
        displayName: message.message.contactMessage.displayName || 'Contact'
      };
      
    default:
      return null;
  }
}

// Check if media is available for download
function isMediaAvailable(message, messageType) {
  if (!message.message || !message.message[messageType + 'Message']) {
    return false;
  }
  
  const mediaMessage = message.message[messageType + 'Message'];
  
  // Check if any of the required keys are present
  return !!(mediaMessage.mediaKey || mediaMessage.fileSha256 || mediaMessage.url);
}

module.exports = {
  saveMedia,
  saveContactVCard,
  getMediaFileInfo,
  isMediaAvailable
};