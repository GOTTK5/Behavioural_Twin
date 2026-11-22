const { DailySummary, WeeklySummary, BehavioralKnowledge, Episode } = require('../../models/Intelligence');
const { searchMemories } = require('../memory/vectorStore');
const { currentPatternFilter } = require('../processing/correlation');

// Gathers everything Twin needs to answer one message:
// recent structured data from MongoDB + semantically relevant memories.
async function buildContext(user, userQuery, today) {
  const userId = user._id;

  const [latestWeek, recentDailies, knowledgePatterns, activeEpisodes, memories] = await Promise.all([
    WeeklySummary.findOne({ userId }).sort({ weekYear: -1 }).lean(),
    DailySummary.find({ userId }).sort({ date: -1 }).limit(7).lean(),
    BehavioralKnowledge.find({ userId, ...currentPatternFilter(today) }).sort({ confidenceRank: -1, observedWeeks: -1 }).limit(5).lean(),
    Episode.find({ userId, resolved: false }).sort({ startDate: -1 }).limit(3).lean(),
    searchMemories(userId, userQuery)
  ]);

  const todaySummary = recentDailies.find(d => d.date === today) || null;

  return {
    today,
    userName: user.name,
    todayLogged: Boolean(todaySummary),
    mostRecentDataDate: recentDailies[0]?.date || null,
    currentState: buildCurrentState(recentDailies),
    latestWeekLabel: latestWeek ? `${latestWeek.weekYear} (${latestWeek.startDate} to ${latestWeek.endDate})` : null,
    latestWeekSummary: latestWeek?.summary || null,
    dominantSignals: latestWeek?.dominantSignals || [],
    behavioralPatterns: knowledgePatterns.map(k => `${k.pattern} — ${k.confidence} confidence, seen in ${k.observedWeeks} week(s)`),
    activeEpisodes: activeEpisodes.map(e => `${e.label} since ${e.startDate} (${e.severity})`),
    relevantPatterns: memories.pattern,
    similarPastWeeks: memories.weekly,
    relevantEpisodes: memories.episode
  };
}

// Human-readable snapshot: per-day lines for the last 7 logged days plus trends.
function buildCurrentState(recentDailies) {
  if (!recentDailies.length) return '';

  const lines = recentDailies.map(d => `- ${d.date}: ${d.summary || 'no details'}${d.signals?.length ? ` [signals: ${d.signals.join(', ')}]` : ''}`);

  const trends = [
    getTrendLine(recentDailies, 'moodScore', 1, 'Mood'),
    getTrendLine(recentDailies, 'sleepHours', 1, 'Sleep'),
    getTrendLine(recentDailies, 'taskCompletionRate', 0.15, 'Productivity'),
    getTrendLine(recentDailies, 'screenTimeHours', 1, 'Screen time', true),
    getTrendLine(recentDailies, 'steps', 1000, 'Steps')
  ].filter(Boolean);

  return [...lines, ...trends].join('\n');
}

// recentDailies is newest-first. lowerIsBetter flips "improving"/"declining".
function getTrendLine(recentDailies, metricKey, threshold, label, lowerIsBetter = false) {
  const values = recentDailies.map(d => d.metrics?.[metricKey]).filter(v => v != null);
  if (values.length < 4) return null;

  const mean = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;
  const half = Math.floor(values.length / 2);
  const diff = mean(values.slice(0, half)) - mean(values.slice(-half)); // recent − older

  if (Math.abs(diff) <= threshold) return `${label} trend: stable`;
  const rising = diff > 0;
  const word = rising !== lowerIsBetter ? 'improving' : 'declining';
  return `${label} trend: ${rising ? 'rising' : 'falling'} (${word}) over the last ${values.length} logged days`;
}

module.exports = { buildContext, getTrendLine };
