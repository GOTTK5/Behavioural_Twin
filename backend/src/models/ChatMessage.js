const mongoose = require('mongoose');

const chatMessageSchema = new mongoose.Schema({
  userId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  role:      { type: String, enum: ['user', 'assistant'], required: true },
  content:   { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

// Fast lookup of a user's recent messages in order
chatMessageSchema.index({ userId: 1, _id: -1 });

module.exports = mongoose.model('ChatMessage', chatMessageSchema);