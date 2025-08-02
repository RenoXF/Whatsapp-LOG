const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// Global socket variable (will be set from main.js)
let sock = null;

// Function to set the socket instance
const setSocket = (socket) => {
  sock = socket;
};

// Helper function to convert base64 to buffer
const base64ToBuffer = (base64) => {
  // Remove data URL prefix if present
  const base64Data = base64.replace(/^data:\w+\/\w+;base64,/, '');
  return Buffer.from(base64Data, 'base64');
};

// Helper function to save base64 to temporary file
const saveBase64ToFile = async (base64, mimeType) => {
  // Create temp directory if it doesn't exist
  const tempDir = path.join(__dirname, '../temp');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  // Generate unique filename
  const extension = mimeType.split('/')[1] || 'bin';
  const filename = `${uuidv4()}.${extension}`;
  const filepath = path.join(tempDir, filename);

  // Convert base64 to buffer and save
  const buffer = base64ToBuffer(base64);
  fs.writeFileSync(filepath, buffer);

  return filepath;
};

// Send text message endpoint
router.post('/text', async (req, res) => {
  try {
    const { jid, message } = req.body;

    // Validate required fields
    if (!jid || !message) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: jid and message'
      });
    }

    // Check if socket is connected
    if (!sock) {
      return res.status(500).json({
        success: false,
        error: 'WhatsApp socket not connected'
      });
    }

    // Send the message
    await sock.sendMessage(jid, { text: message });

    res.json({
      success: true,
      message: 'Message sent successfully',
      data: {
        jid,
        message
      }
    });
  } catch (error) {
    console.error('Error sending text message:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to send message',
      details: error.message
    });
  }
});

// Send media message endpoint
router.post('/media', async (req, res) => {
  try {
    const { jid, media, caption, type, filename } = req.body;

    // Validate required fields
    if (!jid || !media || !type) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: jid, media, and type'
      });
    }

    // Check if socket is connected
    if (!sock) {
      return res.status(500).json({
        success: false,
        error: 'WhatsApp socket not connected'
      });
    }

    let mediaMessage;

    // Check if media is a URL or base64
    if (media.startsWith('http://') || media.startsWith('https://')) {
      // Handle URL media
      mediaMessage = { url: media };
    } else {
      // Handle base64 media
      try {
        // Determine MIME type based on media type
        let mimeType;
        switch (type.toLowerCase()) {
          case 'image':
            mimeType = 'image/jpeg';
            break;
          case 'video':
            mimeType = 'video/mp4';
            break;
          case 'audio':
            mimeType = 'audio/mpeg';
            break;
          case 'document':
            mimeType = 'application/pdf';
            break;
          case 'sticker':
            mimeType = 'image/webp';
            break;
          default:
            mimeType = 'application/octet-stream';
        }

        // Save base64 to temporary file
        const filepath = await saveBase64ToFile(media, mimeType);
        
        // Create media message from file
        mediaMessage = fs.readFileSync(filepath);
        
        // Clean up temporary file
        fs.unlinkSync(filepath);
      } catch (error) {
        console.error('Error processing base64 media:', error);
        return res.status(400).json({
          success: false,
          error: 'Invalid base64 media data',
          details: error.message
        });
      }
    }

    // Prepare message options
    const messageOptions = {
      caption: caption || '',
      mimetype: mediaMessage.mimetype || type
    };

    // Add filename for documents
    if (type.toLowerCase() === 'document' && filename) {
      messageOptions.fileName = filename;
    }

    // Set media type
    switch (type.toLowerCase()) {
      case 'image':
        messageOptions.image = mediaMessage;
        break;
      case 'video':
        messageOptions.video = mediaMessage;
        break;
      case 'audio':
        messageOptions.audio = mediaMessage;
        break;
      case 'document':
        messageOptions.document = mediaMessage;
        break;
      case 'sticker':
        messageOptions.sticker = mediaMessage;
        break;
      default:
        return res.status(400).json({
          success: false,
          error: 'Invalid media type. Supported types: image, video, audio, document, sticker'
        });
    }

    // Send the message
    await sock.sendMessage(jid, messageOptions);

    res.json({
      success: true,
      message: 'Media sent successfully',
      data: {
        jid,
        type,
        caption,
        filename
      }
    });
  } catch (error) {
    console.error('Error sending media message:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to send media',
      details: error.message
    });
  }
});

// Send message with buttons endpoint
router.post('/buttons', async (req, res) => {
  try {
    const { jid, text, buttons, footer } = req.body;

    // Validate required fields
    if (!jid || !text || !buttons || !Array.isArray(buttons)) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: jid, text, and buttons (array)'
      });
    }

    // Check if socket is connected
    if (!sock) {
      return res.status(500).json({
        success: false,
        error: 'WhatsApp socket not connected'
      });
    }

    // Format buttons
    const formattedButtons = buttons.map(button => ({
      buttonId: button.id,
      buttonText: { displayText: button.text },
      type: 1
    }));

    // Prepare message
    const message = {
      text: text,
      footer: footer || '',
      buttons: formattedButtons,
      headerType: 1
    };

    // Send the message
    await sock.sendMessage(jid, message);

    res.json({
      success: true,
      message: 'Message with buttons sent successfully',
      data: {
        jid,
        text,
        buttons,
        footer
      }
    });
  } catch (error) {
    console.error('Error sending message with buttons:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to send message with buttons',
      details: error.message
    });
  }
});

// Send list message endpoint
router.post('/list', async (req, res) => {
  try {
    const { jid, text, buttonText, sections, footer } = req.body;

    // Validate required fields
    if (!jid || !text || !buttonText || !sections || !Array.isArray(sections)) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: jid, text, buttonText, and sections (array)'
      });
    }

    // Check if socket is connected
    if (!sock) {
      return res.status(500).json({
        success: false,
        error: 'WhatsApp socket not connected'
      });
    }

    // Prepare message
    const message = {
      text: text,
      footer: footer || '',
      buttonText: buttonText,
      sections: sections,
      listType: 1
    };

    // Send the message
    await sock.sendMessage(jid, message);

    res.json({
      success: true,
      message: 'List message sent successfully',
      data: {
        jid,
        text,
        buttonText,
        sections,
        footer
      }
    });
  } catch (error) {
    console.error('Error sending list message:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to send list message',
      details: error.message
    });
  }
});

// Get connection status endpoint
router.get('/status', (req, res) => {
  try {
    const isConnected = sock && sock.user;
    
    res.json({
      success: true,
      data: {
        connected: isConnected,
        user: isConnected ? sock.user : null
      }
    });
  } catch (error) {
    console.error('Error getting connection status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get connection status',
      details: error.message
    });
  }
});

module.exports = {
  router,
  setSocket
};