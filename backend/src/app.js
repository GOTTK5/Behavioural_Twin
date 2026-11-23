const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const mongoose = require('mongoose');
const { config } = require('./config/env');
const { HttpError } = require('./utils/http');
const { getDbError } = require('./config/db');
const { isConfigured: isAIConfigured, checkAI } = require('./modules/ai/gemini');

function createApp() {
  const app = express();

  app.set('trust proxy', 1); // behind Render/Railway/Nginx: real client IP for rate limits
  app.use(helmet({ contentSecurityPolicy: false }));
  if (config.frontendUrl) {
    app.use(cors({ origin: config.frontendUrl.split(',').map(s => s.trim()), credentials: true }));
  }
  app.use(express.json({ limit: '100kb' }));

  app.get('/api/health', async (req, res) => {
    const dbUp = mongoose.connection.readyState === 1;
    // /api/health?ai=check makes one tiny real Gemini call to verify chat works
    const aiCheck = req.query.ai === 'check' ? { aiCheck: await checkAI() } : {};
    res.json({
      ...aiCheck,
      status: dbUp ? 'ok' : 'degraded',
      db: dbUp ? 'connected' : 'disconnected',
      ...(dbUp ? {} : { dbError: getDbError() || 'connecting...' }),
      ai: isAIConfigured() ? 'configured' : 'missing GEMINI_API_KEY',
      email: config.email.enabled ? 'configured' : 'not configured (password reset emails disabled)'
    });
  });

  // While the database is down, fail API calls fast with a clear message.
  app.use('/api', (req, res, next) => {
    if (mongoose.connection.readyState === 1) return next();
    res.status(503).json({ error: 'Database is not connected yet — please try again shortly.' });
  });

  app.use('/api/auth',      require('./routes/auth'));
  app.use('/api/ingest',    require('./routes/ingest'));
  app.use('/api/chat',      require('./routes/chat'));
  app.use('/api/dashboard', require('./routes/dashboard'));
  app.use('/api/insights',  require('./routes/insights'));
  app.use('/api/google',    require('./routes/google'));

  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

  // In production the backend also serves the built React app (single deployment).
  const buildDir = path.resolve(__dirname, '../../frontend/build');
  if (fs.existsSync(buildDir)) {
    app.use(express.static(buildDir, { index: false, maxAge: '1h' }));
    app.get('*', (req, res) => res.sendFile(path.join(buildDir, 'index.html')));
  }

  // Central error handler — never leaks internal details to the client.
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err instanceof HttpError) {
      return res.status(err.status).json({ error: err.message, ...err.extra });
    }
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON body' });
    if (err.name === 'ValidationError' || err.name === 'CastError') {
      return res.status(400).json({ error: config.isProduction ? 'Invalid input' : err.message });
    }
    console.error(`[error] ${req.method} ${req.originalUrl}:`, err);
    res.status(500).json({ error: config.isProduction ? 'Something went wrong' : err.message });
  });

  return app;
}

module.exports = { createApp };
