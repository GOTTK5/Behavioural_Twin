const express = require('express');
const { protect } = require('../middleware/auth');
const { DailySummary, WeeklySummary, BehavioralKnowledge, Episode } = require('../models/Intelligence');
const { Mood, Task, HealthLog, PsychTest } = require('../models/Inputs');
const { getLocalDateString } = require('../utils/dateUtils');

const router = express.Router();
router.use(protect);

// GET /api/dashboard/overview — main dashboard data
router.get('/overview', async (req, res) => {
  try {
    const userId = req.user._id;
    const days = parseInt(req.query.days) || 30;

    // Last N days of daily summaries
    const dailies = await DailySummary.find({ userId })
      .sort({ date: -1 })
      .limit(days);

    // Latest week summary
    const latestWeek = await WeeklySummary.findOne({ userId }).sort({ weekYear: -1 });

    // Top patterns
    const patterns = await BehavioralKnowledge.find({ userId, confidence: { $in: ['medium', 'high'] } })
      .sort({ observedWeeks: -1 })
      .limit(5);

    // Active episodes
    const activeEpisodes = await Episode.find({ userId, resolved: false }).sort({ startDate: -1 });

    // Today's data
    const today = getLocalDateString();
    const todayTasks = await Task.find({ userId, date: today });

    res.json({
      trends: {
        mood:             dailies.map(d => ({ date: d.date, value: d.metrics.moodScore })).reverse(),
        sleep:            dailies.map(d => ({ date: d.date, value: d.metrics.sleepHours })).reverse(),
        steps:            dailies.map(d => ({ date: d.date, value: d.metrics.steps })).reverse(),
        exercise:         dailies.map(d => ({ date: d.date, value: d.metrics.exerciseMinutes })).reverse(),
        screenTime:       dailies.map(d => ({ date: d.date, value: d.metrics.screenTimeHours })).reverse(),
        productivity:     dailies.map(d => ({ date: d.date, value: d.metrics.taskCompletionRate })).reverse(),
        anxiety:          dailies.map(d => ({ date: d.date, value: d.metrics.anxietyScore })).reverse()
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
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/dashboard/weekly — weekly summaries list
router.get('/weekly', async (req, res) => {
  try {
    const weeks = await WeeklySummary.find({ userId: req.user._id })
      .sort({ weekYear: -1 })
      .limit(12);
    res.json({ weeks });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/dashboard/today — today's log status
router.get('/today', async (req, res) => {
  try {
    const userId = req.user._id;
    const today = new Date().toISOString().split('T')[0];

    const [mood, journal, health, tasks] = await Promise.all([
      require('../models/Inputs').Mood.findOne({ userId, date: today }),
      require('../models/Inputs').Journal.findOne({ userId, date: today }),
      HealthLog.findOne({ userId, date: today }),
      Task.find({ userId, date: today })
    ]);

    // Check if weekly psych test is due
    const weekYear = getWeekYear(today);
    const psychTest = await PsychTest.findOne({ userId, weekYear });

    res.json({
      date: today,
      logged: {
        mood:     !!mood,
        journal:  !!journal,
        health:   !!health,
        tasks:    tasks.length > 0
      },
      psychTestDue: !psychTest,
      completionScore: [!!mood, !!journal, !!health, tasks.length > 0].filter(Boolean).length
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/dashboard/trigger-batch — manual trigger for testing
router.post('/trigger-batch', async (req, res) => {
  try {
    const { runWeeklyBatchForUser } = require('../jobs/scheduler');
    const { generateDailySummary }  = require('../modules/processing/dailySummary');
    const today = new Date().toISOString().split('T')[0];
    await generateDailySummary(req.user._id, today);
    const result = await runWeeklyBatchForUser(req.user._id);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function getWeekYear(dateStr) {
  const d = new Date(dateStr);
  const jan1 = new Date(d.getFullYear(), 0, 1);
  const week = Math.ceil(((d - jan1) / 86400000 + jan1.getDay() + 1) / 7);
  return `${d.getFullYear()}-W${String(week).padStart(2, '0')}`;
}

module.exports = router;
