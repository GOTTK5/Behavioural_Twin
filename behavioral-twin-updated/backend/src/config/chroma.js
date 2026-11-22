const { ChromaClient } = require('chromadb');

let client;
let collections = {};

async function connectChroma() {
  try {
    client = new ChromaClient({ path: process.env.CHROMA_HOST });
    await client.heartbeat();

    // Create collections if they don't exist
    collections.weeklySummaries = await client.getOrCreateCollection({
      name: 'weekly_summaries',
      metadata: { description: 'Weekly behavioral summaries for RAG' }
    });

    collections.knowledgePatterns = await client.getOrCreateCollection({
      name: 'knowledge_patterns',
      metadata: { description: 'Discovered behavioral patterns' }
    });

    collections.episodes = await client.getOrCreateCollection({
      name: 'episodes',
      metadata: { description: 'Significant life episodes' }
    });

    console.log('ChromaDB connected — 3 collections ready');
  } catch (err) {
    console.error('ChromaDB connection failed:', err.message);
    console.log('Continuing without ChromaDB — vector features disabled');
  }
}

function getCollection(name) {
  return collections[name];
}

function getClient() {
  return client;
}

module.exports = { connectChroma, getCollection, getClient };
