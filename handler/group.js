const { pool } = require('../database/db');
const { saveContactInfo } = require('./contact'); // Import contact handler

/**
 * Convert Unix timestamp to MySQL datetime format
 * @param {number|null} timestamp - Unix timestamp in seconds
 * @returns {string|null} MySQL datetime string or null
 */
const convertTimestampToDatetime = (timestamp) => {
  if (!timestamp) return null;
  return new Date(timestamp * 1000).toISOString().slice(0, 19).replace('T', ' ');
};

/**
 * Save group information to the database
 * @param {Object} group - Group object with all WhatsApp group data
 * @returns {Promise<void>}
 */
const saveGroupInfo = async (group) => {
  try {
    // Ensure we have a valid group ID
    if (!group.group_id) {
      console.error('❌ Group ID is missing:', group);
      return;
    }

    // Check if group already exists
    const [existingGroup] = await pool.query(
      'SELECT group_id FROM whatsapp_groups WHERE group_id = ?',
      [group.group_id]
    );

    // Convert timestamps to MySQL datetime format
    const creationDatetime = convertTimestampToDatetime(group.creation);
    const ephemeralSettingDatetime = convertTimestampToDatetime(group.ephemeralSettingTimestamp);

    if (existingGroup.length > 0) {
      // Update existing group
      await pool.query(`
        UPDATE whatsapp_groups SET
          group_name = ?,
          creation = ?,
          owner = ?,
          description = ?,
          description_id = ?,
          is_restricted = ?,
          announce = ?,
          ephemeral_duration = ?,
          ephemeral_setting_timestamp = ?,
          is_community = ?,
          is_parent_group = ?,
          parent_group_id = ?,
          linked_parent_groups = ?,
          participant_count = ?,
          last_updated = CURRENT_TIMESTAMP
        WHERE group_id = ?
      `, [
        group.group_name || group.subject, // Use subject as fallback
        creationDatetime,
        group.owner,
        group.desc,
        group.descId,
        group.restrict,
        group.announce,
        group.ephemeralDuration,
        ephemeralSettingDatetime,
        group.isCommunity,
        group.isParentGroup,
        group.parentGroupId,
        JSON.stringify(group.linkedParentGroups || []),
        group.size || group.participants?.length || 0,
        group.group_id
      ]);
      
      console.log(`👥 Updated group: ${group.group_id}`);
      
      // Update participants
      await saveGroupParticipants(group.group_id, group.participants);
    } else {
      // Insert new group
      await pool.query(`
        INSERT INTO whatsapp_groups (
          group_id, group_name, creation, owner, description, description_id,
          is_restricted, announce, ephemeral_duration, ephemeral_setting_timestamp,
          is_community, is_parent_group, parent_group_id, linked_parent_groups,
          participant_count, last_updated
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `, [
        group.group_id,
        group.group_name || group.subject, // Use subject as fallback
        creationDatetime,
        group.owner,
        group.desc,
        group.descId,
        group.restrict,
        group.announce,
        group.ephemeralDuration,
        ephemeralSettingDatetime,
        group.isCommunity,
        group.isParentGroup,
        group.parentGroupId,
        JSON.stringify(group.linkedParentGroups || []),
        group.size || group.participants?.length || 0
      ]);
      
      console.log(`👥 Added new group: ${group.group_id}`);
      
      // Save participants
      await saveGroupParticipants(group.group_id, group.participants);
    }
  } catch (error) {
    console.error('❌ Error saving group:', group.group_id || 'undefined', error);
    throw error;
  }
};

/**
 * Save group participants to the database
 * @param {string} groupId - Group ID
 * @param {Array} participants - Array of participant objects
 * @returns {Promise<void>}
 */
const saveGroupParticipants = async (groupId, participants) => {
  if (!participants || participants.length === 0) {
    console.log(`⚠️ No participants to save for group: ${groupId}`);
    return;
  }

  try {
    // First, ensure all participants exist in the contacts table
    for (const participant of participants) {
      const jid = participant.id || participant.jid;
      
      // Skip if we don't have a valid JID
      if (!jid) {
        console.warn('⚠️ Participant missing JID:', participant);
        continue;
      }
      
      // Check if contact exists
      const [existingContact] = await pool.query(
        'SELECT jid FROM contacts WHERE jid = ?',
        [jid]
      );
      
      // If contact doesn't exist, create a minimal record
      if (existingContact.length === 0) {
        console.log(`📇 Creating minimal contact record for: ${jid}`);
        
        const contactData = {
          jid: jid,
          name: participant.name || participant.notify || null,
          notify: participant.notify || null,
          verifiedName: participant.verifiedName || null,
          imgUrl: participant.imgUrl || null,
          status: participant.status || null,
          isBusiness: participant.isBusiness || participant.business || false,
          isEnterprise: participant.isEnterprise || false,
          verified: participant.verified || false,
          inPhoneBook: participant.inPhoneBook || false,
          known: participant.known || false,
          profilePicUrl: participant.profilePicUrl || null,
          lastSeen: participant.lastSeen || null,
          about: participant.about || null,
          shortName: participant.shortName || null,
          pushName: participant.pushName || null,
          formattedName: participant.formattedName || null,
          vname: participant.vname || null,
          labels: participant.labels || [],
          lastUpdated: new Date().toISOString()
        };
        
        await saveContactInfo(contactData);
      }
    }
    
    // Delete existing participants for this group
    await pool.query('DELETE FROM group_participants WHERE group_id = ?', [groupId]);
    
    // Prepare values for batch insert (only include participants with valid JIDs)
    const validParticipants = participants.filter(p => p.id || p.jid);
    const values = validParticipants.map(p => [
      groupId,
      p.id || p.jid,
      p.admin || null,
      p.jid || p.id,
      new Date()
    ]);
    
    // Insert all participants
    if (values.length > 0) {
      await pool.query(`
        INSERT INTO group_participants (
          group_id, participant_id, admin_level, jid, joined_at
        ) VALUES ?
      `, [values]);
      
      console.log(`👥 Saved ${values.length} participants for group: ${groupId}`);
    } else {
      console.log(`⚠️ No valid participants to save for group: ${groupId}`);
    }
  } catch (error) {
    console.error('❌ Error saving participants for group:', groupId, error);
    throw error;
  }
};

/**
 * Get all groups from the database
 * @returns {Promise<Array>} Array of group objects
 */
const getAllGroups = async () => {
  try {
    const [rows] = await pool.query('SELECT * FROM whatsapp_groups ORDER BY group_name ASC');
    return rows;
  } catch (error) {
    console.error('❌ Error fetching groups:', error);
    throw error;
  }
};

/**
 * Get a specific group by ID
 * @param {string} groupId - Group ID
 * @returns {Promise<Object|null>} Group object or null if not found
 */
const getGroupById = async (groupId) => {
  try {
    const [rows] = await pool.query('SELECT * FROM whatsapp_groups WHERE group_id = ?', [groupId]);
    return rows.length > 0 ? rows[0] : null;
  } catch (error) {
    console.error('❌ Error fetching group:', groupId, error);
    throw error;
  }
};

/**
 * Get all participants for a specific group
 * @param {string} groupId - Group ID
 * @returns {Promise<Array>} Array of participant objects
 */
const getGroupParticipants = async (groupId) => {
  try {
    const [rows] = await pool.query(`
      SELECT gp.*, c.name, c.img_url 
      FROM group_participants gp
      LEFT JOIN contacts c ON gp.participant_id = c.jid
      WHERE gp.group_id = ?
      ORDER BY gp.admin_level DESC, c.name ASC
    `, [groupId]);
    
    return rows;
  } catch (error) {
    console.error('❌ Error fetching group participants:', groupId, error);
    throw error;
  }
};

module.exports = {
  saveGroupInfo,
  saveGroupParticipants,
  getAllGroups,
  getGroupById,
  getGroupParticipants
};