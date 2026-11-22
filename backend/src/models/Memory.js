const mongoose = require('mongoose');

// Semantic memory for Twin's RAG retrieval. Replaces ChromaDB: each user only
// has tens to hundreds of memories, so storing vectors in MongoDB and ranking
// them in Node is fast and removes a whole service from deployment.
const memorySchema = new mongoose.Schema({
  userId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  kind:      { type: String, enum: ['weekly', 'pattern', 'episode'], required: true },
  refId:     { type: String, required: true }, // id of the source document
  text:      { type: String, required: true },
  embedding: { type: [Number], required: true },
  updatedAt: { type: Date, default: Date.now }
});
memorySchema.index({ userId: 1, kind: 1, refId: 1 }, { unique: true });

module.exports = mongoose.model('Memory', memorySchema);
