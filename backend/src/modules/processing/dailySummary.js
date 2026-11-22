const { Mood, Journal, Task, HealthLog, PsychTest } = require('../../models/Inputs');
const { DailySummary } = require('../../models/Intelligence');
const { addDays } = require('../../utils/dateUtils');

// Pure function: turns one day's raw inputs into signals (used by episode
// detection and pattern discovery). Exported for tests.
function buildSignals({ mood, healthLog, taskCompletionRate, anxietyLevel }) {
  const signals = [];
  if (mood?.score != null && mood.score <= 3)                         signals.push('low_mood');
  if (mood?.score != null && mood.score >= 8)                         signals.push('high_mood');
  if (healthLog?.sleepHours != null && healthLog.sleepHours < 5)      signals.push('low_sleep');
  if (healthLog?.sleepHours != null && healthLog.sleepHours >= 8)     signals.push('good_sleep');
  if (taskCompletionRate != null && taskCompletionRate < 0.3)         signals.push('low_productivity');
  if (taskCompletionRate != null && taskCompletionRate >= 0.8)        signals.push('high_productivity');
  if (healthLog?.screenTimeHours != null && healthLog.screenTimeHours > 6) signals.push('high_screen_time');
  if (healthLog?.exerciseMinutes != null && healthLog.exerciseMinutes > 15) signals.push('exercised');
  if (anxietyLevel === 'moderate' || anxietyLevel === 'severe')       signals.push('high_anxiety');
  return signals;
}

async function generateDailySummary(userId, date) {
  // GAD-7 is taken weekly and asks about the last two weeks, so the most
  // recent test from the past 7 days describes this day too.
  const [mood, journal, healthLog, psychTest, tasks] = await Promise.all([
    Mood.findOne({ userId, date }),
    Journal.findOne({ userId, date }),
    HealthLog.findOne({ userId, date }),
    PsychTest.findOne({ userId, date: { $gte: addDays(date, -6), $lte: date } }).sort({ date: -1 }),
    Task.find({ userId, date })
  ]);

  const doneTasks = tasks.filter(t => t.done).length;
  const taskCompletionRate = tasks.length > 0 ? doneTasks / tasks.length : null;

  const signals = buildSignals({ mood, healthLog, taskCompletionRate, anxietyLevel: psychTest?.anxietyLevel });

  const parts = [];
  if (mood)                               parts.push(`Mood: ${mood.score}/9${mood.text ? ` — "${mood.text}"` : ''}`);
  if (healthLog?.sleepHours != null)      parts.push(`Sleep: ${healthLog.sleepHours}h`);
  if (healthLog?.steps != null)           parts.push(`Steps: ${healthLog.steps}`);
  if (healthLog?.exerciseMinutes != null) parts.push(`Exercise: ${healthLog.exerciseMinutes} min`);
  if (healthLog?.screenTimeHours != null) parts.push(`Screen time: ${healthLog.screenTimeHours}h`);
  if (tasks.length > 0)                   parts.push(`Tasks: ${doneTasks}/${tasks.length} done`);
  if (journal)   parts.push(`Journal: ${journal.text.substring(0, 100)}${journal.text.length > 100 ? '...' : ''}`);
  if (psychTest) parts.push(`Anxiety (GAD-7, ${psychTest.date}): ${psychTest.totalScore}/21 — ${psychTest.anxietyLevel}`);

  const hasAnyData = Boolean(mood || journal || healthLog || tasks.length || psychTest);

  // Nothing logged — don't leave an empty summary behind (it would show as a gap of nulls).
  if (!hasAnyData) {
    await DailySummary.deleteOne({ userId, date });
    return null;
  }

  return DailySummary.findOneAndUpdate(
    { userId, date },
    {
      summary: parts.join('. '),
      signals,
      metrics: {
        moodScore:          mood?.score ?? null,
        sleepHours:         healthLog?.sleepHours ?? null,
        steps:              healthLog?.steps ?? null,
        exerciseMinutes:    healthLog?.exerciseMinutes ?? null,
        screenTimeHours:    healthLog?.screenTimeHours ?? null,
        taskCompletionRate,
        journalWordCount:   journal ? journal.text.split(/\s+/).filter(Boolean).length : null,
        anxietyScore:       psychTest?.totalScore ?? null
      }
    },
    { upsert: true, new: true }
  );
}

module.exports = { generateDailySummary, buildSignals };
