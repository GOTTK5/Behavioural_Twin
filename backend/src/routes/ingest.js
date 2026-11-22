const express = require('express');
const mongoose = require('mongoose');
const { protect } = require('../middleware/auth');
const { Mood, Journal, Task, HealthLog, PsychTest } = require('../models/Inputs');
const { WeeklySummary } = require('../models/Intelligence');
const User = require('../models/User');
const { generateDailySummary } = require('../modules/processing/dailySummary');
const { HttpError, asyncHandler, optionalNumber, requiredString, optionalString, clampInt } = require('../utils/http');
const { resolveDate, userToday } = require('../utils/userDate');
const { addDays, getWeekYear, getWeekRange } = require('../utils/dateUtils');

const router = express.Router();
router.use(protect);

// Keep the day's summary in sync with every change, so the dashboard and
// Twin always see fresh data instead of waiting for a nightly job.
async function refreshSummary(userId, date) {
  try {
    await generateDailySummary(userId, date);
    // If this day's week was already analysed, mark it for re-processing.
    await WeeklySummary.updateOne({ userId, weekYear: getWeekYear(date) }, { stale: true });
  } catch (err) {
    console.error('[ingest] daily summary refresh failed:', err.message);
  }
}

function lastNDaysFilter(user, days) {
  const today = userToday(user);
  return { $gte: addDays(today, -(days - 1)), $lte: today };
}

function assertObjectId(id) {
  if (!mongoose.isValidObjectId(id)) throw new HttpError(404, 'Not found');
}

// GET /api/ingest/day?date=YYYY-MM-DD — everything logged for one day
router.get('/day', asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const date = resolveDate(req.user, req.query.date);
  const { weekYear } = getWeekRange(date);

  const [mood, journal, health, tasks, psychTest] = await Promise.all([
    Mood.findOne({ userId, date }).lean(),
    Journal.findOne({ userId, date }).lean(),
    HealthLog.findOne({ userId, date }).lean(),
    Task.find({ userId, date }).sort({ createdAt: 1 }).lean(),
    PsychTest.findOne({ userId, weekYear }).lean()
  ]);

  res.json({
    date,
    today: userToday(req.user),
    mood, journal, health, tasks,
    psychTest: psychTest ? { totalScore: psychTest.totalScore, anxietyLevel: psychTest.anxietyLevel, date: psychTest.date } : null,
    psychTestDue: !psychTest
  });
}));

// ── Mood ──────────────────────────────────────────────
router.post('/mood', asyncHandler(async (req, res) => {
  const date = resolveDate(req.user, req.body.date);
  const score = optionalNumber(req.body.score, 'score', { min: 1, max: 9, integer: true });
  if (score == null) throw new HttpError(400, 'score is required (1-9)');
  const text = optionalString(req.body.text, 'text', { max: 1000 });

  const mood = await Mood.findOneAndUpdate({ userId: req.user._id, date }, { score, text }, { upsert: true, new: true });
  await refreshSummary(req.user._id, date);
  res.json({ mood });
}));

router.get('/mood', asyncHandler(async (req, res) => {
  const days = clampInt(req.query.days, 30, 1, 365);
  const moods = await Mood.find({ userId: req.user._id, date: lastNDaysFilter(req.user, days) }).sort({ date: -1 });
  res.json({ moods });
}));

// ── Journal ───────────────────────────────────────────
router.post('/journal', asyncHandler(async (req, res) => {
  const date = resolveDate(req.user, req.body.date);
  const text = requiredString(req.body.text, 'text', { max: 20000 });

  const journal = await Journal.findOneAndUpdate({ userId: req.user._id, date }, { text }, { upsert: true, new: true });
  await refreshSummary(req.user._id, date);
  res.json({ journal });
}));

router.get('/journal', asyncHandler(async (req, res) => {
  const days = clampInt(req.query.days, 30, 1, 365);
  const journals = await Journal.find({ userId: req.user._id, date: lastNDaysFilter(req.user, days) }).sort({ date: -1 });
  res.json({ journals });
}));

// ── Tasks ─────────────────────────────────────────────
router.post('/task', asyncHandler(async (req, res) => {
  const date = resolveDate(req.user, req.body.date);
  const title = requiredString(req.body.title, 'title', { max: 300 });

  const task = await Task.create({ userId: req.user._id, date, title });
  await refreshSummary(req.user._id, date);
  res.status(201).json({ task });
}));

router.patch('/task/:id/toggle', asyncHandler(async (req, res) => {
  assertObjectId(req.params.id);
  const task = await Task.findOne({ _id: req.params.id, userId: req.user._id });
  if (!task) throw new HttpError(404, 'Task not found');
  task.done = !task.done;
  task.completedAt = task.done ? new Date() : null;
  await task.save();
  await refreshSummary(req.user._id, task.date);
  res.json({ task });
}));

router.delete('/task/:id', asyncHandler(async (req, res) => {
  assertObjectId(req.params.id);
  const task = await Task.findOneAndDelete({ _id: req.params.id, userId: req.user._id });
  if (!task) throw new HttpError(404, 'Task not found');
  await refreshSummary(req.user._id, task.date);
  res.json({ success: true });
}));

router.get('/tasks', asyncHandler(async (req, res) => {
  const query = { userId: req.user._id };
  if (req.query.date) query.date = resolveDate(req.user, req.query.date);
  const tasks = await Task.find(query).sort({ createdAt: -1 }).limit(500);
  res.json({ tasks });
}));

// ── Health Log (manual) ───────────────────────────────
// Only fields present in the body are changed. Sending null clears a field.
// Manually entered sleep/steps are marked 'manual' so Google Fit never overwrites them.
router.post('/health', asyncHandler(async (req, res) => {
  const date = resolveDate(req.user, req.body.date);
  const fields = {
    sleepHours:      optionalNumber(req.body.sleepHours, 'sleepHours', { min: 0, max: 24 }),
    steps:           optionalNumber(req.body.steps, 'steps', { min: 0, max: 200000, integer: true }),
    exerciseMinutes: optionalNumber(req.body.exerciseMinutes, 'exerciseMinutes', { min: 0, max: 1440, integer: true }),
    screenTimeHours: optionalNumber(req.body.screenTimeHours, 'screenTimeHours', { min: 0, max: 24 })
  };

  const update = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) update[key] = value;
  }
  if ('sleepHours' in update) update['source.sleep'] = update.sleepHours == null ? null : 'manual';
  if ('steps' in update)      update['source.steps'] = update.steps == null ? null : 'manual';
  if (!Object.keys(update).length) throw new HttpError(400, 'Nothing to save');

  const log = await HealthLog.findOneAndUpdate({ userId: req.user._id, date }, update, { upsert: true, new: true });
  await refreshSummary(req.user._id, date);
  res.json({ log });
}));

router.get('/health', asyncHandler(async (req, res) => {
  const days = clampInt(req.query.days, 30, 1, 365);
  const logs = await HealthLog.find({ userId: req.user._id, date: lastNDaysFilter(req.user, days) }).sort({ date: -1 });
  res.json({ logs });
}));

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

function anxietyLevelFor(total) {
  return total <= 4 ? 'minimal' : total <= 9 ? 'mild' : total <= 14 ? 'moderate' : 'severe';
}

router.get('/psych-test/questions', (req, res) => {
  res.json({ questions: GAD7_QUESTIONS, scale: '0=Not at all, 1=Several days, 2=More than half the days, 3=Nearly every day' });
});

router.post('/psych-test', asyncHandler(async (req, res) => {
  const date = resolveDate(req.user, req.body.date);
  const { answers } = req.body; // e.g. [0,1,2,3,2,1,0]
  if (!Array.isArray(answers) || answers.length !== 7 || !answers.every(a => Number.isInteger(a) && a >= 0 && a <= 3)) {
    throw new HttpError(400, 'answers must be 7 whole numbers between 0 and 3');
  }

  const totalScore = answers.reduce((a, b) => a + b, 0);
  const anxietyLevel = anxietyLevelFor(totalScore);
  const weekYear = getWeekYear(date);
  const formattedAnswers = GAD7_QUESTIONS.map((question, i) => ({ question, score: answers[i] }));

  const test = await PsychTest.findOneAndUpdate(
    { userId: req.user._id, weekYear },
    { date, weekYear, answers: formattedAnswers, totalScore, anxietyLevel },
    { upsert: true, new: true }
  );
  await User.updateOne({ _id: req.user._id }, { lastPsychTestDate: new Date(`${date}T00:00:00Z`) });

  // The test result applies to this day and the following 6 (see dailySummary).
  for (let i = 0; i < 7; i++) {
    const d = addDays(date, i);
    if (d > userToday(req.user)) break;
    await refreshSummary(req.user._id, d);
  }

  res.json({ test, supportSuggested: anxietyLevel === 'severe' || answers[6] >= 2 });
}));

module.exports = router;
module.exports.anxietyLevelFor = anxietyLevelFor;
