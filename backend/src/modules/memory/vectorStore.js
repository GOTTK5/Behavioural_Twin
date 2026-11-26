const Memory = require('../../models/Memory');
const { embed, isConfigured } = require('../ai/gemini');

function cosineSimilarity(a, b) {
  let dot = 0, na = 0, nb = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    na  += a[i] * a[i];
    nb  += b[i] * b[i];
  }
  return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
}

async function upsertMemory(userId, kind, refId, text) {
  if (!isConfigured() || !text) return false;
  try {
    const embedding = await embed(text, 'RETRIEVAL_DOCUMENT');
    await Memory.findOneAndUpdate(
      { userId, kind, refId: String(refId) },
      { text, embedding, updatedAt: new Date() },
      { upsert: true }
    );
    return true;
  } catch (err) {
    console.error(`[memory] embed failed (${kind}):`, err.message);
    return false;
  }
}

async function deleteMemory(userId, kind, refId) {
  await Memory.deleteOne({ userId, kind, refId: String(refId) });
}

async function searchMemories(userId, query, limits = { weekly: 3, pattern: 3, episode: 2 }) {
  const empty = { weekly: [], pattern: [], episode: [] };
  if (!isConfigured()) return empty;

  let queryVector;
  try {
    queryVector = await embed(query, 'RETRIEVAL_QUERY');
  } catch (err) {
    console.error('[memory] query embed failed:', err.message);
    return empty;
  }

  const memories = await Memory.find({ userId }).select('kind text embedding').lean();
  const result = { weekly: [], pattern: [], episode: [] };

  for (const kind of Object.keys(result)) {
    result[kind] = memories
      .filter(m => m.kind === kind)
      .map(m => ({ text: m.text, score: cosineSimilarity(queryVector, m.embedding) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limits[kind] || 0)
      .map(m => m.text);
  }
  return result;
}

module.exports = { upsertMemory, deleteMemory, searchMemories, cosineSimilarity };
