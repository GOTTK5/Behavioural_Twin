const { Mood, Journal, Task, HealthLog, PsychTest } = require('../../models/Inputs');
const { DailySummary } = require('../../models/Intelligence');

async function generateDailySummary(userId, date) {
  // Fetch all data for the day
  const [mood, journal, healthLog, psychTest] = await Promise.all([
    Mood.findOne({ userId, date }),
    Journal.findOne({ userId, date }),
    HealthLog.findOne({ userId, date }),
    PsychTest.findOne({ userId, date })
  ]);

  const tasks = await Task.find({ userId, date });
  const doneTasks = tasks.filter(t => t.done).length;
  const taskCompletionRate = tasks.length > 0 ? doneTasks / tasks.length : null;

  // Build signals array — these drive episode detection and pattern discovery
  const signals = [];
  if (mood?.score <= 3)                              signals.push('low_mood');
  if (mood?.score >= 8)                              signals.push('high_mood');
  if (healthLog?.sleepHours != null && healthLog.sleepHours < 5) signals.push('low_sleep');
  if (healthLog?.sleepHours != null && healthLog.sleepHours >= 8) signals.push('good_sleep');
  if (taskCompletionRate != null && taskCompletionRate < 0.3)    signals.push('low_productivity');
  if (taskCompletionRate != null && taskCompletionRate >= 0.8)   signals.push('high_productivity');
  if (healthLog?.screenTimeHours != null && healthLog.screenTimeHours > 6) signals.push('high_screen_time');
  if (healthLog?.exerciseMinutes != null && healthLog.exerciseMinutes > 15)  signals.push('exercised');
  if (psychTest?.anxietyLevel === 'moderate' || psychTest?.anxietyLevel === 'severe') signals.push('high_anxiety');

  // Build human-readable summary text
  const parts = [];
  if (mood)       parts.push(`Mood: ${mood.score}/9${mood.text ? ` — "${mood.text}"` : ''}`);
  if (healthLog?.sleepHours)       parts.push(`Sleep: ${healthLog.sleepHours}h`);
  if (healthLog?.steps)            parts.push(`Steps: ${healthLog.steps}`);
  if (healthLog?.exerciseMinutes)  parts.push(`Exercise: ${healthLog.exerciseMinutes} min`);
  if (healthLog?.screenTimeHours)  parts.push(`Screen time: ${healthLog.screenTimeHours}h`);
  if (tasks.length > 0)            parts.push(`Tasks: ${doneTasks}/${tasks.length} done`);
  if (journal)    parts.push(`Journal: ${journal.text.substring(0, 100)}${journal.text.length > 100 ? '...' : ''}`);
  if (psychTest)  parts.push(`Anxiety (GAD-7): ${psychTest.totalScore}/21 — ${psychTest.anxietyLevel}`);

  const summary = parts.join('. ') || 'No data logged for this day.';

  const doc = await DailySummary.findOneAndUpdate(
    { userId, date },
    {
      summary,
      signals,
      metrics: {
        moodScore:          mood?.score ?? null,
        sleepHours:         healthLog?.sleepHours ?? null,
        steps:              healthLog?.steps ?? null,
        exerciseMinutes:    healthLog?.exerciseMinutes ?? null,
        screenTimeHours:    healthLog?.screenTimeHours ?? null,
        taskCompletionRate: taskCompletionRate,
        journalWordCount:   journal ? journal.text.split(' ').length : null,
        anxietyScore:       psychTest?.totalScore ?? null
      }
    },
    { upsert: true, new: true }
  );

  return doc;
}

module.exports = { generateDailySummary };
