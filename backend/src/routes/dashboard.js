const express = require('express');
const rateLimit = require('express-rate-limit');
const { protect } = require('../middleware/auth');
const { DailySummary, WeeklySummary, BehavioralKnowledge, Episode } = require('../models/Intelligence');
const { Mood, Journal, Task, HealthLog, PsychTest } = require('../models/Inputs');
const { runWeeklyBatchForUser } = require('../modules/processing/weeklyBatch');
const { generateDailySummary } = require('../modules/processing/dailySummary');
const { asyncHandler, clampInt } = require('../utils/http');
const { userToday } = require('../utils/userDate');
const { addDays, getWeekYear } = require('../utils/dateUtils');

const router = express.Router();
router.use(protect);

// GET /api/dashboard/overview?days=30
router.get('/overview', asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const days = clampInt(req.query.days, 30, 7, 365);
  const today = userToday(req.user);

  const [dailies, latestWeek, patterns, activeEpisodes, todayTasks] = await Promise.all([
    DailySummary.find({ userId, date: { $gte: addDays(today, -(days - 1)), $lte: today } }).sort({ date: 1 }).lean(),
    WeeklySummary.findOne({ userId }).sort({ weekYear: -1 }).lean(),
    BehavioralKnowledge.find({ userId, confidence: { $in: ['medium', 'high'] } })
      .sort({ confidenceRank: -1, observedWeeks: -1 }).limit(5).lean(),
    Episode.find({ userId, resolved: false }).sort({ startDate: -1 }).lean(),
    Task.find({ userId, date: today }).lean()
  ]);

  const series = (key) => dailies.map(d => ({ date: d.date, value: d.metrics?.[key] ?? null }));

  res.json({
    today,
    trends: {
      mood:         series('moodScore'),
      sleep:        series('sleepHours'),
      steps:        series('steps'),
      exercise:     series('exerciseMinutes'),
      screenTime:   series('screenTimeHours'),
      productivity: series('taskCompletionRate'),
      anxiety:      series('anxietyScore')
    },
    latestWeek,
    patterns: patterns.map(p => ({ pattern: p.pattern, confidence: p.confidence, weeks: p.observedWeeks })),
    activeEpisodes,
    todayTasks: {
      total: todayTasks.length,
      done: todayTasks.filter(t => t.done).length,
      tasks: todayTasks
    }
  });
}));

// GET /api/dashboard/weekly
router.get('/weekly', asyncHandler(async (req, res) => {
  const weeks = await WeeklySummary.find({ userId: req.user._id }).sort({ weekYear: -1 }).limit(12);
  res.json({ weeks });
}));

// GET /api/dashboard/today — today's log status
router.get('/today', asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const today = userToday(req.user);

  const [mood, journal, health, taskCount, psychTest] = await Promise.all([
    Mood.exists({ userId, date: today }),
    Journal.exists({ userId, date: today }),
    HealthLog.exists({ userId, date: today }),
    Task.countDocuments({ userId, date: today }),
    PsychTest.exists({ userId, weekYear: getWeekYear(today) })
  ]);

  const logged = { mood: !!mood, journal: !!journal, health: !!health, tasks: taskCount > 0 };
  res.json({
    date: today,
    logged,
    psychTestDue: !psychTest,
    completionScore: Object.values(logged).filter(Boolean).length
  });
}));

// POST /api/dashboard/trigger-batch — rebuild summaries/patterns on demand
const batchLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 3,
  keyGenerator: (req) => req.user._id.toString(),
  message: { error: 'Batch was run recently — please wait a few minutes.' }
});

router.post('/trigger-batch', batchLimiter, asyncHandler(async (req, res) => {
  const today = userToday(req.user);
  // Refresh the last 7 days of daily summaries first, then process the last completed week
  for (let i = 0; i < 7; i++) await generateDailySummary(req.user._id, addDays(today, -i));
  const result = await runWeeklyBatchForUser(req.user);
  res.json({ success: true, ...result });
}));

module.exports = router;
