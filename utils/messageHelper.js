import fs from 'fs';
import { Logger } from './AzusaLogger.js';

const logger = new Logger();

/**
 * Helper class for handling messages and media
 */
class MessageHelper {
  /**
   * Send a text message
   * @param {Object} sock - The WhatsApp socket instance
   * @param {String} jid - The JID to send to
   * @param {String} text - The text to send
   * @param {Object} quoted - Message to quote (optional)
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} - Sent message info
   */
  static async sendText(sock, jid, text, quoted = '', options = {}) {
    try {
      return await sock.sendMessage(jid, { text, ...options }, { quoted });
    } catch (error) {
      logger.handleError(error, 'Error sending text message');
      throw error;
    }
  }

  /**
   * Send an image
   * @param {Object} sock - The WhatsApp socket instance
   * @param {String} jid - The JID to send to
   * @param {Buffer|String} image - Image buffer or URL
   * @param {String} caption - Image caption
   * @param {Object} quoted - Message to quote (optional)
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} - Sent message info
   */
  static async sendImage(sock, jid, image, caption = '', quoted = '', options = {}) {
    try {
      let buffer;
      
      if (Buffer.isBuffer(image)) {
        buffer = image;
      } else if (image.startsWith('http')) {
        const response = await fetch(image);
        buffer = Buffer.from(await response.arrayBuffer());
      } else if (fs.existsSync(image)) {
        buffer = fs.readFileSync(image);
      } else {
        throw new Error('Invalid image source');
      }
      
      return await sock.sendMessage(jid, {
        image: buffer,
        caption,
        ...options
      }, { quoted });
    } catch (error) {
      logger.handleError(error, 'Error sending image');
      throw error;
    }
  }

  /**
   * Extract message body from different message types
   * @param {Object} msg - The message object
   * @returns {String} - Extracted message body
   */
  static getMessageBody(msg) {
    if (!msg.message) return '';
    
    const type = Object.keys(msg.message)[0];
    
    // Handle different message types
    switch (type) {
      case 'conversation':
        return msg.message.conversation;
      case 'imageMessage':
        return msg.message.imageMessage.caption;
      case 'videoMessage':
        return msg.message.videoMessage.caption;
      case 'extendedTextMessage':
        return msg.message.extendedTextMessage.text;
      case 'buttonsResponseMessage':
        return msg.message.buttonsResponseMessage.selectedButtonId;
      case 'listResponseMessage':
        return msg.message.listResponseMessage.singleSelectReply.selectedRowId;
      case 'templateButtonReplyMessage':
        return msg.message.templateButtonReplyMessage.selectedId;
      default:
        return '';
    }
  }

  /**
   * Check if a message is from a specific JID
   * @param {Object} sock - The WhatsApp socket instance
   * @param {Object} msg - The message object
   * @param {String} jid - The JID to check
   * @returns {Boolean} - True if message is from the JID
   */
  static isFromJid(sock, msg, jid) {
    return msg.key.remoteJid === jid;
  }

  /**
   * Check if a user is an admin based on config
   * @param {String} jid - The user's JID
   * @param {Array} adminList - List of admin JIDs
   * @returns {Boolean} - True if user is admin
   */
  static isAdmin(jid, adminList) {
    // Remove @s.whatsapp.net for comparison
    const number = jid.split('@')[0];
    return adminList.includes(number);
  }
}

export default MessageHelper;
