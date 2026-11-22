require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { connectMongo } = require('./src/config/db');
const { connectChroma } = require('./src/config/chroma');
const { startCronJobs } = require('./src/jobs/scheduler');

const app = express();

// Middleware
app.use(cors({ origin: process.env.FRONTEND_URL, credentials: true }));
app.use(express.json());

// Routes
app.use('/api/auth',      require('./src/routes/auth'));
app.use('/api/ingest',    require('./src/routes/ingest'));
app.use('/api/chat',      require('./src/routes/chat'));
app.use('/api/dashboard', require('./src/routes/dashboard'));
app.use('/api/insights',  require('./src/routes/insights'));
app.use('/api/google',    require('./src/routes/google'));

app.get('/api/health', (req, res) => res.json({ status: 'Twin backend running' }));

const PORT = process.env.PORT || 5000;

async function start() {
  await connectMongo();
  await connectChroma();
  startCronJobs();
  app.listen(PORT, () => console.log(`Twin backend running on port ${PORT}`));
}

start();
