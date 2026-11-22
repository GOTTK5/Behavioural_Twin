const { generateWeeklySummary } = require('./weeklySummary');
const { runCorrelationEngine, updateKnowledgeTable } = require('./correlation');
const { runEpisodeDetector } = require('./episodeDetector');
const { BehavioralKnowledge, Episode, WeeklySummary } = require('../../models/Intelligence');
const { upsertMemory } = require('../memory/vectorStore');
const Memory = require('../../models/Memory');
const { getLastCompletedWeekRange } = require('../../utils/dateUtils');

function episodeText(ep) {
  return `${ep.label} from ${ep.startDate} to ${ep.endDate}. Severity: ${ep.severity}. Triggers: ${(ep.triggers || []).join(', ')}.`;
}

// Stores anything not yet embedded in semantic memory (also retries past failures).
// `refreshWeek` is re-embedded even if already stored, because it was just regenerated.
async function embedPending(userId, refreshWeek = null) {
  const stored = new Set(await Memory.distinct('refId', { userId, kind: 'weekly' }));
  const weekly = await WeeklySummary.find({ userId }).sort({ weekYear: -1 }).limit(52);
  for (const w of weekly) {
    if (!stored.has(w.weekYear) || w.weekYear === refreshWeek) {
      await upsertMemory(userId, 'weekly', w.weekYear, w.summary);
    }
  }

  const patterns = await BehavioralKnowledge.find({ userId, embedded: { $ne: true } });
  for (const p of patterns) {
    if (await upsertMemory(userId, 'pattern', `${p.sourceA}_${p.sourceB}`, p.pattern)) {
      await BehavioralKnowledge.updateOne({ _id: p._id }, { embedded: true });
    }
  }

  const episodes = await Episode.find({ userId, embedded: { $ne: true } });
  for (const ep of episodes) {
    if (await upsertMemory(userId, 'episode', ep._id, episodeText(ep))) {
      await Episode.updateOne({ _id: ep._id }, { embedded: true });
    }
  }
}

// Full weekly pipeline for one user. `range` defaults to the user's last
// completed Monday–Sunday week.
async function runWeeklyBatchForUser(user, range) {
  const { startDate, endDate, weekYear } = range || getLastCompletedWeekRange(user.timezone);

  const weekly = await generateWeeklySummary(user._id, weekYear, startDate, endDate);
  const correlations = await runCorrelationEngine(user._id, endDate);
  await updateKnowledgeTable(user._id, correlations, weekYear, startDate, endDate);
  const episodes = await runEpisodeDetector(user._id, endDate);
  await embedPending(user._id, weekly ? weekYear : null);

  return { weekYear, startDate, endDate, hadData: Boolean(weekly), patterns: correlations.length, episodes: episodes.length };
}

module.exports = { runWeeklyBatchForUser, embedPending };
