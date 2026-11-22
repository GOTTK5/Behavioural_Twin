const mongoose = require('mongoose');

// ── Daily Summary ─────────────────────────────────────
const dailySummarySchema = new mongoose.Schema({
  userId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  date:     { type: String, required: true }, // YYYY-MM-DD
  summary:  { type: String },
  signals:  [{ type: String }], // ['low_mood', 'low_sleep', 'low_productivity']
  metrics: {
    moodScore:          { type: Number, default: null },
    sleepHours:         { type: Number, default: null },
    steps:              { type: Number, default: null },
    exerciseMinutes:    { type: Number, default: null },
    screenTimeHours:    { type: Number, default: null },
    taskCompletionRate: { type: Number, default: null }, // 0-1
    journalWordCount:   { type: Number, default: null },
    anxietyScore:       { type: Number, default: null }
  },
  createdAt: { type: Date, default: Date.now }
});
dailySummarySchema.index({ userId: 1, date: 1 }, { unique: true });

// ── Weekly Summary ────────────────────────────────────
const weeklySummarySchema = new mongoose.Schema({
  userId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  weekYear: { type: String, required: true }, // "2026-W24"
  startDate: { type: String },
  endDate:   { type: String },
  summary:   { type: String },
  changes: {
    mood:       { type: Number }, // % change from previous week
    sleep:      { type: Number },
    steps:      { type: Number },
    exercise:   { type: Number },
    screenTime: { type: Number },
    productivity: { type: Number }
  },
  averages: {
    mood:             { type: Number },
    sleepHours:       { type: Number },
    steps:            { type: Number },
    exerciseMinutes:  { type: Number },
    screenTimeHours:  { type: Number },
    taskCompletionRate: { type: Number },
    anxietyScore:     { type: Number }
  },
  dominantSignals: [{ type: String }],
  createdAt:       { type: Date, default: Date.now }
});
weeklySummarySchema.index({ userId: 1, weekYear: 1 }, { unique: true });

// ── Behavioral Knowledge ──────────────────────────────
const behavioralKnowledgeSchema = new mongoose.Schema({
  userId:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  pattern:     { type: String, required: true }, // human readable
  sourceA:     { type: String }, // e.g. 'sleep'
  sourceB:     { type: String }, // e.g. 'mood'
  correlation: { type: Number }, // Pearson -1 to 1
  confidence:  { type: String, enum: ['low', 'medium', 'high'] },
  confidenceRank: { type: Number, default: 0 }, // 1 low, 2 medium, 3 high — sortable (strings sort alphabetically)
  observedWeeks: { type: Number, default: 0 },
  firstSeen:   { type: Date },
  lastSeen:    { type: Date },
  supportingWeeks: [{ type: String }], // weekYear references
  embedded:    { type: Boolean, default: false } // true once stored in semantic memory
});
behavioralKnowledgeSchema.index({ userId: 1, sourceA: 1, sourceB: 1 }, { unique: true });

// ── Episode ───────────────────────────────────────────
const episodeSchema = new mongoose.Schema({
  userId:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  episodeType: { type: String }, // 'burnout', 'low_mood_streak', 'sleep_deprivation', 'productivity_crash'
  label:       { type: String }, // human readable label
  startDate:   { type: String },
  endDate:     { type: String },
  severity:    { type: String, enum: ['mild', 'moderate', 'severe'] },
  triggers:    [{ type: String }], // signals that triggered detection
  resolved:    { type: Boolean, default: false },
  resolvedByUser: { type: Boolean, default: false },
  embedded:    { type: Boolean, default: false },
  createdAt:   { type: Date, default: Date.now }
});
episodeSchema.index({ userId: 1, episodeType: 1, startDate: 1 }, { unique: true });

module.exports = {
  DailySummary:        mongoose.model('DailySummary',        dailySummarySchema),
  WeeklySummary:       mongoose.model('WeeklySummary',       weeklySummarySchema),
  BehavioralKnowledge: mongoose.model('BehavioralKnowledge', behavioralKnowledgeSchema),
  Episode:             mongoose.model('Episode',             episodeSchema)
};
