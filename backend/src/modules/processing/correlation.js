const ss = require('simple-statistics');
const { DailySummary, BehavioralKnowledge } = require('../../models/Intelligence');
const { addDays } = require('../../utils/dateUtils');

// Correlations are computed over a rolling window ending at the processed
// week. 7 days is too few points to say anything; 28 gives real signal.
const WINDOW_DAYS = 28;
const MIN_PAIRS = 7;
const MIN_ABS_R = 0.4;

// Labels are neutral; direction wording comes from the sign of r so the
// sentence never contradicts the number.
const METRIC_PAIRS = [
  ['sleepHours',         'moodScore',          'sleep and mood'],
  ['sleepHours',         'taskCompletionRate', 'sleep and productivity'],
  ['steps',              'moodScore',          'physical activity and mood'],
  ['exerciseMinutes',    'moodScore',          'exercise and mood'],
  ['screenTimeHours',    'sleepHours',         'screen time and sleep'],
  ['screenTimeHours',    'moodScore',          'screen time and mood'],
  ['screenTimeHours',    'taskCompletionRate', 'screen time and productivity'],
  ['anxietyScore',       'moodScore',          'anxiety and mood'],
  ['anxietyScore',       'sleepHours',         'anxiety and sleep'],
  ['taskCompletionRate', 'moodScore',          'productivity and mood'],
];

const CONFIDENCE_RANK = { low: 1, medium: 2, high: 3 };

function describePattern(label, correlation) {
  const [nameA, nameB] = label.split(' and ');
  const relation = correlation > 0 ? 'higher' : 'lower';
  return `Higher ${nameA} is associated with ${relation} ${nameB} (r=${correlation.toFixed(2)})`;
}

function confidenceFor(absR, n) {
  if (absR >= 0.7 && n >= 14) return 'high';
  if (absR >= 0.55) return 'medium';
  return 'low';
}

// Pure function: summaries → correlation results. Exported for tests.
function computeCorrelations(summaries) {
  const results = [];
  for (const [metricA, metricB, label] of METRIC_PAIRS) {
    const pairs = summaries
      .map(s => [s.metrics?.[metricA], s.metrics?.[metricB]])
      .filter(([a, b]) => a != null && b != null);
    if (pairs.length < MIN_PAIRS) continue;

    const xs = pairs.map(p => p[0]);
    const ys = pairs.map(p => p[1]);
    if (new Set(xs).size < 2 || new Set(ys).size < 2) continue; // no variance

    let r;
    try { r = ss.sampleCorrelation(xs, ys); } catch { continue; }
    if (!Number.isFinite(r) || Math.abs(r) < MIN_ABS_R) continue;

    const confidence = confidenceFor(Math.abs(r), pairs.length);
    results.push({ metricA, metricB, correlation: r, confidence, sampleSize: pairs.length, pattern: describePattern(label, r) });
  }
  return results;
}

async function runCorrelationEngine(userId, endDate) {
  const summaries = await DailySummary.find({
    userId,
    date: { $gte: addDays(endDate, -(WINDOW_DAYS - 1)), $lte: endDate }
  }).lean();
  return computeCorrelations(summaries);
}

async function updateKnowledgeTable(userId, correlationResults, weekYear, startDate, endDate) {
  for (const r of correlationResults) {
    const existing = await BehavioralKnowledge.findOne({ userId, sourceA: r.metricA, sourceB: r.metricB });

    if (existing) {
      if (existing.pattern !== r.pattern) existing.embedded = false; // text changed → re-embed
      existing.correlation    = r.correlation;
      existing.confidence     = r.confidence;
      existing.confidenceRank = CONFIDENCE_RANK[r.confidence];
      existing.pattern        = r.pattern;
      if (!existing.supportingWeeks.includes(weekYear)) existing.supportingWeeks.push(weekYear);
      existing.observedWeeks = existing.supportingWeeks.length;
      if (!existing.lastSeen || new Date(endDate) > existing.lastSeen) existing.lastSeen = new Date(endDate);
      if (!existing.firstSeen || new Date(startDate) < existing.firstSeen) existing.firstSeen = new Date(startDate);
      await existing.save();
    } else {
      await BehavioralKnowledge.create({
        userId,
        pattern:         r.pattern,
        sourceA:         r.metricA,
        sourceB:         r.metricB,
        correlation:     r.correlation,
        confidence:      r.confidence,
        confidenceRank:  CONFIDENCE_RANK[r.confidence],
        observedWeeks:   1,
        firstSeen:       new Date(startDate),
        lastSeen:        new Date(endDate),
        supportingWeeks: [weekYear]
      });
    }
  }
}

module.exports = { runCorrelationEngine, updateKnowledgeTable, computeCorrelations, describePattern };
