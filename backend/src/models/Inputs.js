const mongoose = require('mongoose');

const moodSchema = new mongoose.Schema({
  userId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  date:      { type: String, required: true },
  score:     { type: Number, min: 1, max: 9, required: true },
  text:      { type: String, default: '' },
  createdAt: { type: Date, default: Date.now }
});
moodSchema.index({ userId: 1, date: 1 }, { unique: true });

const journalSchema = new mongoose.Schema({
  userId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  date:      { type: String, required: true },
  text:      { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});
journalSchema.index({ userId: 1, date: 1 }, { unique: true });

const taskSchema = new mongoose.Schema({
  userId:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  date:        { type: String, required: true },
  title:       { type: String, required: true },
  done:        { type: Boolean, default: false },
  completedAt: { type: Date },
  createdAt:   { type: Date, default: Date.now }
});
taskSchema.index({ userId: 1, date: 1 });

const healthLogSchema = new mongoose.Schema({
  userId:          { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  date:            { type: String, required: true },
  sleepHours:      { type: Number, default: null },
  steps:           { type: Number, default: null },
  exerciseMinutes: { type: Number, default: null },
  screenTimeHours: { type: Number, default: null },
  createdAt: { type: Date, default: Date.now }
});
healthLogSchema.index({ userId: 1, date: 1 }, { unique: true });

// GAD-7: 7 questions scored 0-3 (total 0-21)
const psychTestSchema = new mongoose.Schema({
  userId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  date:     { type: String, required: true },
  weekYear: { type: String, required: true }, // e.g. "2026-W24"
  answers:  [{ question: String, score: Number }],
  totalScore:    { type: Number, required: true },
  anxietyLevel:  { type: String, enum: ['minimal', 'mild', 'moderate', 'severe'] },
  createdAt:     { type: Date, default: Date.now }
});
psychTestSchema.index({ userId: 1, weekYear: 1 }, { unique: true });
psychTestSchema.index({ userId: 1, date: 1 });

module.exports = {
  Mood:       mongoose.model('Mood',       moodSchema),
  Journal:    mongoose.model('Journal',    journalSchema),
  Task:       mongoose.model('Task',       taskSchema),
  HealthLog:  mongoose.model('HealthLog',  healthLogSchema),
  PsychTest:  mongoose.model('PsychTest',  psychTestSchema)
};
