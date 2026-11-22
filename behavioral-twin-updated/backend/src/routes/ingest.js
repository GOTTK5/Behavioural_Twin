const express = require('express');
const { protect } = require('../middleware/auth');
const { Mood, Journal, Task, HealthLog, PsychTest } = require('../models/Inputs');
const { getLocalDateString } = require('../utils/dateUtils');

const router = express.Router();
router.use(protect);

// ── Mood ──────────────────────────────────────────────
// POST /api/ingest/mood
router.post('/mood', async (req, res) => {
  try {
    const { date, score, text } = req.body;
    const mood = await Mood.findOneAndUpdate(
      { userId: req.user._id, date },
      { score, text },
      { upsert: true, new: true }
    );
    res.json({ mood });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/ingest/mood?days=30
router.get('/mood', async (req, res) => {
  const days = parseInt(req.query.days) || 30;
  const dates = getLast(days);
  const moods = await Mood.find({ userId: req.user._id, date: { $in: dates } }).sort({ date: -1 });
  res.json({ moods });
});

// ── Journal ───────────────────────────────────────────
router.post('/journal', async (req, res) => {
  try {
    const { date, text } = req.body;
    const journal = await Journal.findOneAndUpdate(
      { userId: req.user._id, date },
      { text },
      { upsert: true, new: true }
    );
    res.json({ journal });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/journal', async (req, res) => {
  const days = parseInt(req.query.days) || 30;
  const dates = getLast(days);
  const journals = await Journal.find({ userId: req.user._id, date: { $in: dates } }).sort({ date: -1 });
  res.json({ journals });
});

// ── Tasks ─────────────────────────────────────────────
router.post('/task', async (req, res) => {
  try {
    const { date, title } = req.body;
    const task = await Task.create({ userId: req.user._id, date, title });
    res.json({ task });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/ingest/task/:id/toggle
router.patch('/task/:id/toggle', async (req, res) => {
  try {
    const task = await Task.findOne({ _id: req.params.id, userId: req.user._id });
    if (!task) return res.status(404).json({ error: 'Task not found' });
    task.done = !task.done;
    task.completedAt = task.done ? new Date() : null;
    await task.save();
    res.json({ task });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/task/:id', async (req, res) => {
  try {
    await Task.findOneAndDelete({ _id: req.params.id, userId: req.user._id });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/tasks', async (req, res) => {
  const { date } = req.query;
  const query = { userId: req.user._id };
  if (date) query.date = date;
  const tasks = await Task.find(query).sort({ createdAt: -1 });
  res.json({ tasks });
});

// ── Health Log (manual) ───────────────────────────────
router.post('/health', async (req, res) => {
  try {
    const { date, sleepHours, steps, exerciseMinutes, screenTimeHours } = req.body;
    const log = await HealthLog.findOneAndUpdate(
      { userId: req.user._id, date },
      { sleepHours, steps, exerciseMinutes, screenTimeHours },
      { upsert: true, new: true }
    );
    res.json({ log });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/health', async (req, res) => {
  const days = parseInt(req.query.days) || 30;
  const dates = getLast(days);
  const logs = await HealthLog.find({ userId: req.user._id, date: { $in: dates } }).sort({ date: -1 });
  res.json({ logs });
});

// ── Psychology Test (GAD-7) ───────────────────────────
const GAD7_QUESTIONS = [
  'Feeling nervous, anxious, or on edge',
  'Not being able to stop or control worrying',
  'Worrying too much about different things',
  'Trouble relaxing',
  'Being so restless that it is hard to sit still',
  'Becoming easily annoyed or irritable',
  'Feeling afraid, as if something awful might happen'
];

router.get('/psych-test/questions', protect, (req, res) => {
  res.json({ questions: GAD7_QUESTIONS, scale: '0=Not at all, 1=Several days, 2=More than half, 3=Nearly every day' });
});

router.post('/psych-test', async (req, res) => {
  try {
    const { date, answers } = req.body; // answers: [0,1,2,3,2,1,0]
    const totalScore = answers.reduce((a, b) => a + b, 0);
    const anxietyLevel =
      totalScore <= 4  ? 'minimal'  :
      totalScore <= 9  ? 'mild'     :
      totalScore <= 14 ? 'moderate' : 'severe';

    const weekYear = getWeekYear(date);
    const formattedAnswers = GAD7_QUESTIONS.map((q, i) => ({ question: q, score: answers[i] }));

    const test = await PsychTest.findOneAndUpdate(
      { userId: req.user._id, weekYear },
      { date, weekYear, answers: formattedAnswers, totalScore, anxietyLevel },
      { upsert: true, new: true }
    );

    // Update user's last test date
    await require('../models/User').findByIdAndUpdate(req.user._id, { lastPsychTestDate: new Date(date) });

    res.json({ test });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Helpers ───────────────────────────────────────────
function getLast(n) {
  const dates = [];
  for (let i = 0; i < n; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    // Use local-date formatting consistently, not UTC, so "today" always
    // lines up with what the user sees in their own timezone (IST).
    dates.push(getLocalDateString(d));
  }
  return dates;
}

function getWeekYear(dateStr) {
  const d = new Date(dateStr);
  const jan1 = new Date(d.getFullYear(), 0, 1);
  const week = Math.ceil(((d - jan1) / 86400000 + jan1.getDay() + 1) / 7);
  return `${d.getFullYear()}-W${String(week).padStart(2, '0')}`;
}

module.exports = router;
