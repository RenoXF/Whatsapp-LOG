const mysql = require('mysql2/promise');

// Create connection pool
const pool = mysql.createPool({
  host: 'localhost',
  user: 'root',
  password: '12345678',
  database: 'whatsapp_logs',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  // Add these options to handle string encoding properly
  charset: 'utf8mb4',
  timezone: '+00:00',
  namedPlaceholders: true
});

// Test connection
const testConnection = async () => {
  try {
    const connection = await pool.getConnection();
    await connection.ping();
    connection.release();
    console.log('✅ Database connection successful');
    return true;
  } catch (error) {
    console.error('❌ Database connection failed:', error);
    return false;
  }
};

// Close pool
const closePool = async () => {
  try {
    await pool.end();
    console.log('✅ Database connection pool closed');
  } catch (error) {
    console.error('Error closing database pool:', error);
    throw error;
  }
};

module.exports = {
  pool,
  testConnection,
  closePool
};