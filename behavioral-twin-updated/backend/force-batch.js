require('dotenv').config();
const mongoose = require('mongoose');

async function run() {
  await mongoose.connect(process.env.MONGO_URI);

  const { connectChroma } = require('./src/config/chroma');
  await connectChroma();

  const { generateWeeklySummary, embedKnowledgeInChroma, embedEpisodeInChroma } = require('./src/modules/processing/weeklySummary');
  const { runCorrelationEngine, updateKnowledgeTable } = require('./src/modules/processing/correlation');
  const { runEpisodeDetector } = require('./src/modules/processing/episodeDetector');
  const { BehavioralKnowledge, Episode } = require('./src/models/Intelligence');
  const User = require('./src/models/User');

  const user = await User.findOne({});
  const userId = user._id;

  const weekYear = "2026-W26";
  const startDate = "2026-06-22";
  const endDate = "2026-06-28";

  console.log('Processing week:', weekYear, startDate, 'to', endDate);

  await generateWeeklySummary(userId, weekYear, startDate, endDate);
  const correlations = await runCorrelationEngine(userId, weekYear, startDate, endDate);
  await updateKnowledgeTable(userId, correlations, weekYear, startDate, endDate);

  const newPatterns = await BehavioralKnowledge.find({ userId, chromaEmbedded: false });
  for (const p of newPatterns) await embedKnowledgeInChroma(userId, p);

  await runEpisodeDetector(userId, startDate, endDate);
  const newEpisodes = await Episode.find({ userId, chromaEmbedded: false });
  for (const ep of newEpisodes) await embedEpisodeInChroma(userId, ep);

  console.log('Done!');
  process.exit(0);
}

run().catch(e => { console.error(e); process.exit(1); });