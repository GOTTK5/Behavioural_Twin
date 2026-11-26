const { DailySummary, Episode } = require('../../models/Intelligence');
const { addDays } = require('../../utils/dateUtils');

const WINDOW_DAYS = 28;

const EPISODE_RULES = [
  {
    type: 'low_mood_streak',
    label: 'Low mood streak',
    check: (signals) => signals.includes('low_mood'),
    threshold: 4,
    severity: (count) => count >= 7 ? 'severe' : count >= 5 ? 'moderate' : 'mild'
  },
  {
    type: 'sleep_deprivation',
    label: 'Sleep deprivation period',
    check: (signals) => signals.includes('low_sleep'),
    threshold: 3,
    severity: (count) => count >= 6 ? 'severe' : count >= 4 ? 'moderate' : 'mild'
  },
  {
    type: 'productivity_crash',
    label: 'Productivity crash',
    check: (signals) => signals.includes('low_productivity'),
    threshold: 4,
    severity: (count) => count >= 7 ? 'severe' : count >= 5 ? 'moderate' : 'mild'
  },
  {
    type: 'burnout',
    label: 'Potential burnout',
    check: (signals) => signals.includes('low_mood') && signals.includes('low_productivity'),
    threshold: 3,
    severity: (count) => count >= 5 ? 'severe' : 'moderate'
  },
  {
    type: 'high_anxiety_period',
    label: 'Elevated anxiety period',
    check: (signals) => signals.includes('high_anxiety'),
    threshold: 2,
    severity: (count) => count >= 10 ? 'severe' : 'moderate'
  }
];

// `summaries` sorted ascending; streaks need consecutive days.
function detectEpisodes(summaries, lastDate) {
  const detected = [];

  for (const rule of EPISODE_RULES) {
    let streak = 0;
    let streakStart = null;
    let streakEnd = null;
    let streakSignals = new Set();

    const closeStreak = () => {
      if (streak >= rule.threshold) {
        detected.push({
          episodeType: rule.type,
          label:       rule.label,
          startDate:   streakStart,
          endDate:     streakEnd,
          severity:    rule.severity(streak),
          triggers:    [...streakSignals],
          resolved:    streakEnd !== lastDate
        });
      }
      streak = 0;
      streakStart = streakEnd = null;
      streakSignals = new Set();
    };

    for (const summary of summaries) {
      const matches = rule.check(summary.signals || []);
      const consecutive = streakEnd && addDays(streakEnd, 1) === summary.date;

      if (matches && streak > 0 && !consecutive) closeStreak();

      if (matches) {
        if (streak === 0) streakStart = summary.date;
        streak++;
        streakEnd = summary.date;
        summary.signals.forEach(s => streakSignals.add(s));
      } else {
        closeStreak();
      }
    }
    closeStreak();
  }

  return detected;
}

async function runEpisodeDetector(userId, endDate) {
  const summaries = await DailySummary.find({
    userId,
    date: { $gte: addDays(endDate, -(WINDOW_DAYS - 1)), $lte: endDate }
  }).sort({ date: 1 }).lean();

  const detected = detectEpisodes(summaries, endDate);

  for (const ep of detected) {
    const existing = await Episode.findOne({
      userId,
      episodeType: ep.episodeType,
      startDate: { $lte: ep.endDate },
      endDate:   { $gte: addDays(ep.startDate, -1) }
    }).sort({ startDate: 1 });

    if (!existing) {
      await Episode.create({ userId, ...ep });
      continue;
    }

    const startDate = ep.startDate < existing.startDate ? ep.startDate : existing.startDate;
    const endDate2  = ep.endDate > existing.endDate ? ep.endDate : existing.endDate;
    const changed = startDate !== existing.startDate || endDate2 !== existing.endDate || ep.severity !== existing.severity;

    existing.startDate = startDate;
    existing.endDate   = endDate2;
    existing.severity  = ep.severity;
    existing.triggers  = [...new Set([...existing.triggers, ...ep.triggers])];
    existing.resolved  = existing.resolvedByUser || ep.resolved;
    if (changed) existing.embedded = false;
    await existing.save();
  }

  return detected;
}

module.exports = { runEpisodeDetector, detectEpisodes, EPISODE_RULES };
