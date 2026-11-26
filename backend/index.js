require('dotenv').config();
const mongoose = require('mongoose');
const { loadConfig, config } = require('./src/config/env');
const { connectMongo } = require('./src/config/db');
const { startCronJobs } = require('./src/jobs/scheduler');
const { createApp } = require('./src/app');

function start() {
  loadConfig();

  // Listen before the DB connects so /api/health can report DB problems.
  const server = createApp().listen(config.port, () => {
    console.log(`Twin backend running on port ${config.port}`);
  });

  connectMongo(() => {
    if (config.enableCron) startCronJobs();
  });

  const shutdown = (signal) => {
    console.log(`${signal} received — shutting down`);
    server.close(() => mongoose.connection.close().finally(() => process.exit(0)));
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

try {
  start();
} catch (err) {
  console.error('Failed to start:', err.message);
  process.exit(1);
}
