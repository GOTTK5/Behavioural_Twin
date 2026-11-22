const mongoose = require('mongoose');

// ── Mood ──────────────────────────────────────────────
const moodSchema = new mongoose.Schema({
  userId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  date:      { type: String, required: true }, // YYYY-MM-DD
  score:     { type: Number, min: 1, max: 9, required: true },
  text:      { type: String, default: '' },
  createdAt: { type: Date, default: Date.now }
});
moodSchema.index({ userId: 1, date: 1 }, { unique: true });

// ── Journal ───────────────────────────────────────────
const journalSchema = new mongoose.Schema({
  userId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  date:      { type: String, required: true },
  text:      { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});
journalSchema.index({ userId: 1, date: 1 }, { unique: true });

// ── Task ──────────────────────────────────────────────
const taskSchema = new mongoose.Schema({
  userId:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  date:        { type: String, required: true }, // date task was created
  title:       { type: String, required: true },
  done:        { type: Boolean, default: false },
  completedAt: { type: Date },
  createdAt:   { type: Date, default: Date.now }
});

// ── Health Log (sleep, steps, exercise, screen time) ──
const healthLogSchema = new mongoose.Schema({
  userId:          { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  date:            { type: String, required: true },
  sleepHours:      { type: Number, default: null },   // hours
  steps:           { type: Number, default: null },   // count
  exerciseMinutes: { type: Number, default: null },   // minutes
  screenTimeHours: { type: Number, default: null },   // hours
  source: {
    sleep:    { type: String, enum: ['manual', 'google_fit'], default: 'manual' },
    steps:    { type: String, enum: ['manual', 'google_fit'], default: 'manual' }
  },
  createdAt: { type: Date, default: Date.now }
});
healthLogSchema.index({ userId: 1, date: 1 }, { unique: true });

// ── Psychology Test (GAD-7 Anxiety scale) ─────────────
// GAD-7: 7 questions, each scored 0-3. Total 0-21.
// 0-4 minimal, 5-9 mild, 10-14 moderate, 15-21 severe
const psychTestSchema = new mongoose.Schema({
  userId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  date:     { type: String, required: true },
  weekYear: { type: String, required: true }, // e.g. "2026-W24"
  answers:  [{ question: String, score: Number }], // 7 answers
  totalScore:    { type: Number, required: true },
  anxietyLevel:  { type: String, enum: ['minimal', 'mild', 'moderate', 'severe'] },
  summary:       { type: String }, // AI-generated text summary
  createdAt:     { type: Date, default: Date.now }
});

module.exports = {
  Mood:       mongoose.model('Mood',       moodSchema),
  Journal:    mongoose.model('Journal',    journalSchema),
  Task:       mongoose.model('Task',       taskSchema),
  HealthLog:  mongoose.model('HealthLog',  healthLogSchema),
  PsychTest:  mongoose.model('PsychTest',  psychTestSchema)
};
