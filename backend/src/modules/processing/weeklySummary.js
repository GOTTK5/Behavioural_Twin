const { DailySummary, WeeklySummary } = require('../../models/Intelligence');
const { addDays, getWeekYear } = require('../../utils/dateUtils');

async function generateWeeklySummary(userId, weekYear, startDate, endDate) {
  const dailies = await DailySummary.find({ userId, date: { $gte: startDate, $lte: endDate } }).lean();
  if (dailies.length === 0) return null;

  const avg = (key) => {
    const vals = dailies.map(d => d.metrics?.[key]).filter(v => v != null);
    return vals.length ? parseFloat((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2)) : null;
  };

  const averages = {
    mood:               avg('moodScore'),
    sleepHours:         avg('sleepHours'),
    steps:              avg('steps'),
    exerciseMinutes:    avg('exerciseMinutes'),
    screenTimeHours:    avg('screenTimeHours'),
    taskCompletionRate: avg('taskCompletionRate'),
    anxietyScore:       avg('anxietyScore')
  };

  // Compare against the week immediately before this one (not "the latest other week",
  // which would be wrong when backfilling older weeks).
  const prevWeekDoc = await WeeklySummary.findOne({ userId, weekYear: getWeekYear(addDays(startDate, -7)) }).lean();

  const changes = {};
  if (prevWeekDoc?.averages) {
    const calcChange = (curr, prev) =>
      (curr != null && prev != null && prev !== 0)
        ? parseFloat(((curr - prev) / prev * 100).toFixed(1))
        : null;

    changes.mood         = calcChange(averages.mood,               prevWeekDoc.averages.mood);
    changes.sleep        = calcChange(averages.sleepHours,         prevWeekDoc.averages.sleepHours);
    changes.steps        = calcChange(averages.steps,              prevWeekDoc.averages.steps);
    changes.exercise     = calcChange(averages.exerciseMinutes,    prevWeekDoc.averages.exerciseMinutes);
    changes.screenTime   = calcChange(averages.screenTimeHours,    prevWeekDoc.averages.screenTimeHours);
    changes.productivity = calcChange(averages.taskCompletionRate, prevWeekDoc.averages.taskCompletionRate);
  }

  const signalCounts = {};
  dailies.forEach(d => (d.signals || []).forEach(s => { signalCounts[s] = (signalCounts[s] || 0) + 1; }));
  const dominantSignals = Object.entries(signalCounts)
    .filter(([, count]) => count >= 3)
    .sort((a, b) => b[1] - a[1])
    .map(([signal]) => signal);

  const lines = [`Week ${weekYear} (${startDate} to ${endDate}), ${dailies.length} day(s) logged.`];
  if (averages.mood != null)               lines.push(`Average mood: ${averages.mood}/9.`);
  if (averages.sleepHours != null)         lines.push(`Average sleep: ${averages.sleepHours}h.`);
  if (averages.steps != null)              lines.push(`Average steps: ${Math.round(averages.steps)}.`);
  if (averages.exerciseMinutes != null)    lines.push(`Average exercise: ${averages.exerciseMinutes} min.`);
  if (averages.screenTimeHours != null)    lines.push(`Average screen time: ${averages.screenTimeHours}h.`);
  if (averages.taskCompletionRate != null) lines.push(`Task completion: ${(averages.taskCompletionRate * 100).toFixed(0)}%.`);
  if (averages.anxietyScore != null)       lines.push(`Average anxiety score: ${averages.anxietyScore}/21.`);
  if (dominantSignals.length)              lines.push(`Recurring signals: ${dominantSignals.join(', ')}.`);
  if (changes.mood != null)                lines.push(`Mood changed ${changes.mood > 0 ? '+' : ''}${changes.mood}% vs the previous week.`);

  return WeeklySummary.findOneAndUpdate(
    { userId, weekYear },
    { startDate, endDate, summary: lines.join(' '), averages, changes, dominantSignals },
    { upsert: true, new: true }
  );
}

module.exports = { generateWeeklySummary };
