const mongoose = require('mongoose');
const { config } = require('./env');

async function connectMongo() {
  await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 10000 });
  console.log('MongoDB connected');
}

module.exports = { connectMongo };
