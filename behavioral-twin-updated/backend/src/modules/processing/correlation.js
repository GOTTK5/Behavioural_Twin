// const ss = require('simple-statistics');
// const { DailySummary } = require('../../models/Intelligence');
// const { BehavioralKnowledge } = require('../../models/Intelligence');

// // All metric pairs to check for correlation
// const METRIC_PAIRS = [
//   ['sleepHours',      'moodScore',          'Low sleep precedes lower mood'],
//   ['sleepHours',      'taskCompletionRate', 'Poor sleep reduces productivity'],
//   ['steps',           'moodScore',          'Physical activity improves mood'],
//   ['exerciseMinutes', 'moodScore',          'Exercise boosts mood'],
//   ['screenTimeHours', 'sleepHours',         'High screen time disrupts sleep'],
//   ['screenTimeHours', 'moodScore',          'Excessive screen time affects mood'],
//   ['screenTimeHours', 'taskCompletionRate', 'High screen time reduces productivity'],
//   ['anxietyScore',    'moodScore',          'Anxiety correlates with mood changes'],
//   ['anxietyScore',    'sleepHours',         'Anxiety affects sleep quality'],
//   ['taskCompletionRate', 'moodScore',       'Productivity is linked to mood'],
// ];

// async function runCorrelationEngine(userId, weekYear, startDate, endDate) {
//   // Get daily summaries for the week
//   const summaries = await DailySummary.find({
//     userId,
//     date: { $gte: startDate, $lte: endDate }
//   });

//   if (summaries.length < 3) return []; // Not enough data points

//   const results = [];

//   for (const [metricA, metricB, humanPattern] of METRIC_PAIRS) {
//     const pairs = summaries
//       .map(s => [s.metrics[metricA], s.metrics[metricB]])
//       .filter(([a, b]) => a != null && b != null);

//     if (pairs.length < 3) continue;

//     const xs = pairs.map(p => p[0]);
//     const ys = pairs.map(p => p[1]);

//     let correlation;
//     try {
//       correlation = ss.sampleCorrelation(xs, ys);
//     } catch {
//       continue;
//     }

//     if (isNaN(correlation)) continue;

//     const absCorr = Math.abs(correlation);
//     if (absCorr < 0.4) continue; // Weak correlation — skip

//     const confidence = absCorr >= 0.7 ? 'high' : absCorr >= 0.55 ? 'medium' : 'low';

//     // Direction-aware pattern text
//     const direction = correlation > 0 ? 'positively linked' : 'inversely linked';
//     const pattern = `${humanPattern} (${direction}, r=${correlation.toFixed(2)})`;

//     results.push({ metricA, metricB, correlation, confidence, pattern, weekYear });
//   }

//   return results;
// }

// async function updateKnowledgeTable(userId, correlationResults, weekYear, startDate, endDate) {
//   for (const r of correlationResults) {
//     const existing = await BehavioralKnowledge.findOne({
//       userId,
//       sourceA: r.metricA,
//       sourceB: r.metricB
//     });

//     if (existing) {
//       // Update existing pattern
//       existing.correlation = r.correlation;
//       existing.confidence  = r.confidence;
//       existing.pattern     = r.pattern;

//       if (!existing.supportingWeeks.includes(weekYear)) {
//         existing.supportingWeeks.push(weekYear);
//       }
//       // observedWeeks is always derived from the array — never incremented separately,
//       // so re-running the same week twice can never inflate the count.
//       existing.observedWeeks = existing.supportingWeeks.length;

//       // lastSeen reflects the END of the week whose data produced this result —
//       // not the moment the batch job happened to run.
//       existing.lastSeen = new Date(endDate);

//       // firstSeen should only move if this week's start is earlier than what's
//       // already recorded (covers the case where weeks are processed out of order,
//       // e.g. backfilling a missed week after a later week was already processed).
//       const candidateFirstSeen = new Date(startDate);
//       if (candidateFirstSeen < existing.firstSeen) {
//         existing.firstSeen = candidateFirstSeen;
//       }

//       await existing.save();
//     } else {
//       // Create new pattern
//       await BehavioralKnowledge.create({
//         userId,
//         pattern:        r.pattern,
//         sourceA:        r.metricA,
//         sourceB:        r.metricB,
//         correlation:    r.correlation,
//         confidence:     r.confidence,
//         observedWeeks:  1,
//         firstSeen:      new Date(startDate),
//         lastSeen:       new Date(endDate),
//         supportingWeeks: [weekYear]
//       });
//     }
//   }
// }

// module.exports = { runCorrelationEngine, updateKnowledgeTable };





const ss = require('simple-statistics');
const { DailySummary } = require('../../models/Intelligence');
const { BehavioralKnowledge } = require('../../models/Intelligence');

// All metric pairs to check for correlation.
// Labels are neutral (just the relationship being tested) — the actual
// direction wording is generated dynamically from the real correlation sign,
// so the sentence never contradicts the r value.
const METRIC_PAIRS = [
  ['sleepHours',      'moodScore',          'sleep and mood'],
  ['sleepHours',      'taskCompletionRate', 'sleep and productivity'],
  ['steps',           'moodScore',          'physical activity and mood'],
  ['exerciseMinutes', 'moodScore',          'exercise and mood'],
  ['screenTimeHours', 'sleepHours',         'screen time and sleep'],
  ['screenTimeHours', 'moodScore',          'screen time and mood'],
  ['screenTimeHours', 'taskCompletionRate', 'screen time and productivity'],
  ['anxietyScore',    'moodScore',          'anxiety and mood'],
  ['anxietyScore',    'sleepHours',         'anxiety and sleep'],
  ['taskCompletionRate', 'moodScore',       'productivity and mood'],
];

// Builds a human-readable sentence whose wording always matches the sign of r.
// e.g. "Higher screen time is associated with higher productivity (r=0.80)"
//      "Higher screen time is associated with lower sleep (r=-0.61)"
function describePattern(label, metricA, metricB, correlation) {
  const [nameA, nameB] = label.split(' and ');
  const relation = correlation > 0 ? 'higher' : 'lower';
  return `Higher ${nameA} is associated with ${relation} ${nameB} (r=${correlation.toFixed(2)})`;
}

async function runCorrelationEngine(userId, weekYear, startDate, endDate) {
  // Get daily summaries for the week
  const summaries = await DailySummary.find({
    userId,
    date: { $gte: startDate, $lte: endDate }
  });

  if (summaries.length < 3) return []; // Not enough data points

  const results = [];

  for (const [metricA, metricB, label] of METRIC_PAIRS) {
    const pairs = summaries
      .map(s => [s.metrics[metricA], s.metrics[metricB]])
      .filter(([a, b]) => a != null && b != null);

    if (pairs.length < 3) continue;

    const xs = pairs.map(p => p[0]);
    const ys = pairs.map(p => p[1]);

    let correlation;
    try {
      correlation = ss.sampleCorrelation(xs, ys);
    } catch {
      continue;
    }

    if (isNaN(correlation)) continue;

    const absCorr = Math.abs(correlation);
    if (absCorr < 0.4) continue; // Weak correlation — skip

    const confidence = absCorr >= 0.7 ? 'high' : absCorr >= 0.55 ? 'medium' : 'low';
    const pattern = describePattern(label, metricA, metricB, correlation);

    results.push({ metricA, metricB, correlation, confidence, pattern, weekYear });
  }

  return results;
}

async function updateKnowledgeTable(userId, correlationResults, weekYear, startDate, endDate) {
  for (const r of correlationResults) {
    const existing = await BehavioralKnowledge.findOne({
      userId,
      sourceA: r.metricA,
      sourceB: r.metricB
    });

    if (existing) {
      // Update existing pattern
      existing.correlation = r.correlation;
      existing.confidence  = r.confidence;
      existing.pattern     = r.pattern;

      if (!existing.supportingWeeks.includes(weekYear)) {
        existing.supportingWeeks.push(weekYear);
      }
      // observedWeeks is always derived from the array — never incremented separately,
      // so re-running the same week twice can never inflate the count.
      existing.observedWeeks = existing.supportingWeeks.length;

      // lastSeen reflects the END of the week whose data produced this result —
      // not the moment the batch job happened to run.
      existing.lastSeen = new Date(endDate);

      // firstSeen should only move if this week's start is earlier than what's
      // already recorded (covers the case where weeks are processed out of order,
      // e.g. backfilling a missed week after a later week was already processed).
      const candidateFirstSeen = new Date(startDate);
      if (candidateFirstSeen < existing.firstSeen) {
        existing.firstSeen = candidateFirstSeen;
      }

      await existing.save();
    } else {
      // Create new pattern
      await BehavioralKnowledge.create({
        userId,
        pattern:        r.pattern,
        sourceA:        r.metricA,
        sourceB:        r.metricB,
        correlation:    r.correlation,
        confidence:     r.confidence,
        observedWeeks:  1,
        firstSeen:      new Date(startDate),
        lastSeen:       new Date(endDate),
        supportingWeeks: [weekYear]
      });
    }
  }
}

module.exports = { runCorrelationEngine, updateKnowledgeTable };