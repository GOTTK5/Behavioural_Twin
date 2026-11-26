const mongoose = require('mongoose');

// Embeddings for RAG retrieval, stored in MongoDB (small per-user volume).
const memorySchema = new mongoose.Schema({
  userId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  kind:      { type: String, enum: ['weekly', 'pattern', 'episode'], required: true },
  refId:     { type: String, required: true },
  text:      { type: String, required: true },
  embedding: { type: [Number], required: true },
  updatedAt: { type: Date, default: Date.now }
});
memorySchema.index({ userId: 1, kind: 1, refId: 1 }, { unique: true });

module.exports = mongoose.model('Memory', memorySchema);
