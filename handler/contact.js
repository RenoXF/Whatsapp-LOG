const { pool } = require('../database/db');

/**
 * Save contact information to the database
 * @param {Object} contact - Contact object with all WhatsApp contact data
 * @returns {Promise<void>}
 */
const saveContactInfo = async (contact) => {
  try {
    // Check if contact already exists
    const [existingContact] = await pool.query(
      'SELECT jid FROM contacts WHERE jid = ?',
      [contact.jid]
    );

    if (existingContact.length > 0) {
      // Update existing contact
      await pool.query(`
        UPDATE contacts SET
          name = ?,
          notify = ?,
          verified_name = ?,
          img_url = ?,
          status = ?,
          is_business = ?,
          is_enterprise = ?,
          verified = ?,
          in_phone_book = ?,
          known = ?,
          profile_pic_url = ?,
          last_seen = ?,
          about = ?,
          short_name = ?,
          push_name = ?,
          formatted_name = ?,
          vname = ?,
          labels = ?,
          last_updated = CURRENT_TIMESTAMP
        WHERE jid = ?
      `, [
        contact.name,
        contact.notify,
        contact.verifiedName,
        contact.imgUrl,
        contact.status,
        contact.isBusiness,
        contact.isEnterprise,
        contact.verified,
        contact.inPhoneBook,
        contact.known,
        contact.profilePicUrl,
        contact.lastSeen,
        contact.about,
        contact.shortName,
        contact.pushName,
        contact.formattedName,
        contact.vname,
        JSON.stringify(contact.labels || []),
        contact.jid
      ]);
      
      console.log(`📇 Updated contact: ${contact.jid}`);
    } else {
      // Insert new contact
      await pool.query(`
        INSERT INTO contacts (
          jid, name, notify, verified_name, img_url, status, is_business, is_enterprise,
          verified, in_phone_book, known, profile_pic_url, last_seen, about, short_name,
          push_name, formatted_name, vname, labels, last_updated
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `, [
        contact.jid,
        contact.name,
        contact.notify,
        contact.verifiedName,
        contact.imgUrl,
        contact.status,
        contact.isBusiness,
        contact.isEnterprise,
        contact.verified,
        contact.inPhoneBook,
        contact.known,
        contact.profilePicUrl,
        contact.lastSeen,
        contact.about,
        contact.shortName,
        contact.pushName,
        contact.formattedName,
        contact.vname,
        JSON.stringify(contact.labels || [])
      ]);
      
      console.log(`📇 Added new contact: ${contact.jid}`);
    }
  } catch (error) {
    console.error('❌ Error saving contact:', contact.jid, error);
    throw error;
  }
};

/**
 * Get all contacts from the database
 * @returns {Promise<Array>} Array of contact objects
 */
const getAllContacts = async () => {
  try {
    const [rows] = await pool.query('SELECT * FROM contacts ORDER BY name ASC');
    return rows;
  } catch (error) {
    console.error('❌ Error fetching contacts:', error);
    throw error;
  }
};

/**
 * Get a specific contact by JID
 * @param {string} jid - Contact JID
 * @returns {Promise<Object|null>} Contact object or null if not found
 */
const getContactByJid = async (jid) => {
  try {
    const [rows] = await pool.query('SELECT * FROM contacts WHERE jid = ?', [jid]);
    return rows.length > 0 ? rows[0] : null;
  } catch (error) {
    console.error('❌ Error fetching contact:', jid, error);
    throw error;
  }
};

module.exports = {
  saveContactInfo,
  getAllContacts,
  getContactByJid
};