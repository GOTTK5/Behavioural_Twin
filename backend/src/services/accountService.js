const User = require('../models/User');
const ChatMessage = require('../models/ChatMessage');
const Memory = require('../models/Memory');
const { Mood, Journal, Task, HealthLog, PsychTest } = require('../models/Inputs');
const { DailySummary, WeeklySummary, BehavioralKnowledge, Episode } = require('../models/Intelligence');

const USER_COLLECTIONS = [
  Mood, Journal, Task, HealthLog, PsychTest,
  DailySummary, WeeklySummary, BehavioralKnowledge, Episode,
  ChatMessage, Memory
];

async function exportUserData(userId) {
  const out = {};
  for (const Model of USER_COLLECTIONS) {
    out[Model.modelName] = await Model.find({ userId }).select('-embedding -__v').lean();
  }
  return out;
}

async function deleteAllUserData(userId) {
  await Promise.all(USER_COLLECTIONS.map(Model => Model.deleteMany({ userId })));
  await User.deleteOne({ _id: userId });
}

module.exports = { exportUserData, deleteAllUserData };
