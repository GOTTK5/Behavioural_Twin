const { getCollection } = require('../../config/chroma');
const { DailySummary, WeeklySummary, BehavioralKnowledge } = require('../../models/Intelligence');
const { getLocalDateString } = require('../../utils/dateUtils');

async function buildContext(userId, userQuery) {

  // ── STEP 1: TODAY'S DATE ────────────────────────────────────────────────
  const today = getLocalDateString();

  // ── STEP 2: FETCH DATA FROM MONGODB ────────────────────────────────────
  const currentWeek = await WeeklySummary.findOne({ userId }).sort({ weekYear: -1 });

  const recentDailies = await DailySummary.find({ userId })
    .sort({ date: -1 })
    .limit(7);

  const knowledgePatterns = await BehavioralKnowledge.find({ userId })
    .sort({ confidence: -1, observedWeeks: -1 })
    .limit(5);

  // ── STEP 3: FETCH SEMANTICALLY RELEVANT DATA FROM CHROMADB ─────────────
  let similarWeeks    = [];
  let similarEpisodes = [];
  let relevantPatterns = [];

  const weeksCollection     = getCollection('weeklySummaries');
  const episodesCollection  = getCollection('episodes');
  const knowledgeCollection = getCollection('knowledgePatterns');

  if (weeksCollection) {
    try {
      const res = await weeksCollection.query({
        queryTexts: [userQuery],
        nResults: 3,
        where: { userId: userId.toString() }
      });
      similarWeeks = res.documents[0] || [];
    } catch {}
  }

  if (episodesCollection) {
    try {
      const res = await episodesCollection.query({
        queryTexts: [userQuery],
        nResults: 2,
        where: { userId: userId.toString() }
      });
      similarEpisodes = res.documents[0] || [];
    } catch {}
  }

  if (knowledgeCollection) {
    try {
      const res = await knowledgeCollection.query({
        queryTexts: [userQuery],
        nResults: 3,
        where: { userId: userId.toString() }
      });
      relevantPatterns = res.documents[0] || [];
    } catch {}
  }

  // ── STEP 4: STALENESS AND FRESHNESS CHECKS ─────────────────────────────
  const currentWeekIsStale  = currentWeek ? isWeekStale(currentWeek.endDate, today) : true;
  const todayHasSummary     = recentDailies.some(d => d.date === today);
  const mostRecentDataDate  = recentDailies[0]?.date || null;

  // ── STEP 5: BUILD CURRENT STATE STRING ─────────────────────────────────
  const currentState = buildCurrentState(
    recentDailies,
    today,
    todayHasSummary,
    mostRecentDataDate
  );

  // ── STEP 6: ASSEMBLE CONTEXT PACKAGE ───────────────────────────────────
  const contextPackage = {
    today,
    currentState,
    currentWeekSummary: currentWeek?.summary || null,
    currentWeekLabel: currentWeek
      ? `${currentWeek.weekYear} (${currentWeek.startDate} to ${currentWeek.endDate})${
          currentWeekIsStale
            ? ' — NOTE: this is the most recent completed week on record, not the current live week'
            : ''
        }`
      : 'No completed week summary exists yet',
    recentChanges:             currentWeek?.changes       || null,
    behavioralPatterns:        knowledgePatterns.map(k => k.pattern),
    relevantPatternsFromQuery: relevantPatterns,
    similarPastWeeks:          similarWeeks,
    significantEpisodes:       similarEpisodes,
    dominantSignals:           currentWeek?.dominantSignals || []
  };

  return contextPackage;
}

// ── HELPERS ──────────────────────────────────────────────────────────────

// A week is stale if its end date has already passed — meaning a newer
// week should logically exist but hasn't been batch-processed yet.
function isWeekStale(weekEndDate, today) {
  return new Date(today) > new Date(weekEndDate);
}

// Builds a human-readable snapshot of the user's recent behavioral state.
// Covers latest values for all tracked metrics, plus 7-day trend direction
// for each metric that has enough data points.
// Journal is excluded — unstructured text, not yet processed for trends.
function buildCurrentState(recentDailies, today, todayHasSummary, mostRecentDataDate) {
  const lines = [];

  // Date and data-gap awareness
  lines.push(`Today's date: ${today}.`);
  if (!todayHasSummary) {
    lines.push(
      mostRecentDataDate
        ? `No summary exists yet for today — the most recent logged data is from ${mostRecentDataDate}.`
        : `No behavioral data has been logged yet.`
    );
  }

  if (!recentDailies.length) return lines.join(' ');

  const latest = recentDailies[0];

  // ── Latest recorded values ──
  if (latest.metrics.moodScore != null)
    lines.push(`Most recent mood (${latest.date}): ${latest.metrics.moodScore}/9`);

  if (latest.metrics.sleepHours != null)
    lines.push(`Most recent sleep (${latest.date}): ${latest.metrics.sleepHours}h`);

  if (latest.metrics.steps != null)
    lines.push(`Most recent steps (${latest.date}): ${latest.metrics.steps}`);

  if (latest.metrics.exerciseMinutes != null)
    lines.push(`Most recent exercise (${latest.date}): ${latest.metrics.exerciseMinutes} min`);

  if (latest.metrics.screenTimeHours != null)
    lines.push(`Most recent screen time (${latest.date}): ${latest.metrics.screenTimeHours}h`);

  if (latest.metrics.taskCompletionRate != null)
    lines.push(`Most recent productivity (${latest.date}): ${(latest.metrics.taskCompletionRate * 100).toFixed(0)}%`);

  if (latest.metrics.anxietyScore != null)
    lines.push(`Most recent anxiety score (${latest.date}): ${latest.metrics.anxietyScore}/21`);

  if (latest.signals?.length)
    lines.push(`Signals on ${latest.date}: ${latest.signals.join(', ')}`);

  // ── 7-day trends ──
  const trendLine = getTrendLine(recentDailies, 'moodScore', 1, 'Mood');
  if (trendLine) lines.push(trendLine);

  const sleepTrend = getTrendLine(recentDailies, 'sleepHours', 1, 'Sleep');
  if (sleepTrend) lines.push(sleepTrend);

  const prodTrend = getTrendLine(recentDailies, 'taskCompletionRate', 0.15, 'Productivity');
  if (prodTrend) lines.push(prodTrend);

  const screenTrend = getTrendLine(recentDailies, 'screenTimeHours', 1, 'Screen time');
  if (screenTrend) lines.push(screenTrend);

  const stepsTrend = getTrendLine(recentDailies, 'steps', 1000, 'Steps');
  if (stepsTrend) lines.push(stepsTrend);

  return lines.join('. ');
}

// Generic trend calculator for any metric.
// threshold — minimum difference to call something a trend (avoids noise).
// label     — human-readable metric name for the output string.
function getTrendLine(recentDailies, metricKey, threshold, label) {
  const values = recentDailies
    .map(d => d.metrics[metricKey])
    .filter(v => v != null);

  if (values.length < 3) return null;

  const recentAvg = values.slice(0, 3).reduce((a, b) => a + b, 0) / 3;
  const olderAvg  = values.slice(-3).reduce((a, b) => a + b, 0) / 3;

  const diff    = olderAvg - recentAvg;
  const absDiff = Math.abs(diff);

  if (absDiff > threshold && diff > 0) return `${label} trend: declining over the last 7 days`;
  if (absDiff > threshold && diff < 0) return `${label} trend: improving over the last 7 days`;
  return null;
}

module.exports = { buildContext };

