const express = require('express');
const { router: sendMessageRouter, setSocket } = require('./sendMessage');

const app = express();
const PORT = process.env.API_PORT || 3000;

// Middleware with increased payload size limit
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Routes
app.use('/api', sendMessageRouter);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    error: 'Internal server error'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found'
  });
});

// Start server
const startServer = () => {
  app.listen(PORT, () => {
    console.log(`🚀 API server running on port ${PORT}`);
  });
};

module.exports = {
  startServer,
  setSocket
};