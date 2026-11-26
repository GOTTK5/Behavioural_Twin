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

const SEVERITY_RANK = { mild: 1, moderate: 2, severe: 3 };

// How a newly detected streak updates an existing overlapping episode.
// Never shrinks dates or severity, and never re-opens an episode from a re-run of an older week.
function mergeEpisode(existing, ep) {
  const startDate = ep.startDate < existing.startDate ? ep.startDate : existing.startDate;
  const endDate   = ep.endDate > existing.endDate ? ep.endDate : existing.endDate;
  const severity  = (SEVERITY_RANK[ep.severity] || 0) > (SEVERITY_RANK[existing.severity] || 0) ? ep.severity : existing.severity;
  const extendsIt = ep.endDate >= existing.endDate;
  const resolved  = Boolean(existing.resolvedByUser) || (extendsIt ? ep.resolved : existing.resolved);
  const triggers  = [...new Set([...(existing.triggers || []), ...ep.triggers])];
  const changed   = startDate !== existing.startDate || endDate !== existing.endDate || severity !== existing.severity;
  return { startDate, endDate, severity, resolved, triggers, changed };
}

async function runEpisodeDetector(userId, endDate) {
  const summaries = await DailySummary.find({
    userId,
    date: { $gte: addDays(endDate, -(WINDOW_DAYS - 1)), $lte: endDate }
  }).sort({ date: 1 }).lean();

  const detected = detectEpisodes(summaries, endDate);
  const ongoingIds = [];

  for (const ep of detected) {
    const existing = await Episode.findOne({
      userId,
      episodeType: ep.episodeType,
      startDate: { $lte: ep.endDate },
      endDate:   { $gte: addDays(ep.startDate, -1) }
    }).sort({ startDate: 1 });

    if (!existing) {
      const created = await Episode.create({ userId, ...ep });
      if (!created.resolved) ongoingIds.push(created._id);
      continue;
    }

    const m = mergeEpisode(existing, ep);
    Object.assign(existing, { startDate: m.startDate, endDate: m.endDate, severity: m.severity, resolved: m.resolved, triggers: m.triggers });
    if (m.changed) existing.embedded = false;
    await existing.save();
    if (!existing.resolved) ongoingIds.push(existing._id);
  }

  // An open episode that didn't continue up to this run's last day has ended
  // (e.g. the user stopped logging), so close it instead of leaving it "active" forever.
  await Episode.updateMany(
    { userId, resolved: false, endDate: { $lt: endDate }, _id: { $nin: ongoingIds } },
    { resolved: true, embedded: false }
  );

  return detected;
}

module.exports = { runEpisodeDetector, detectEpisodes, mergeEpisode, EPISODE_RULES };
