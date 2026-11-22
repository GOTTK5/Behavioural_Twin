require('dotenv').config();
const { loadConfig, config } = require('./src/config/env');
const { connectMongo } = require('./src/config/db');
const { startCronJobs } = require('./src/jobs/scheduler');
const { createApp } = require('./src/app');

async function start() {
  loadConfig();
  await connectMongo();
  if (config.enableCron) startCronJobs();

  const server = createApp().listen(config.port, () => {
    console.log(`Twin backend running on port ${config.port}`);
  });

  const shutdown = (signal) => {
    console.log(`${signal} received — shutting down`);
    server.close(() => require('mongoose').connection.close().then(() => process.exit(0)));
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

start().catch((err) => {
  console.error('Failed to start:', err.message);
  process.exit(1);
});
