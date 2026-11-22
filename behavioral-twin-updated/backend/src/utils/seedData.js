require('dotenv').config({ path: '../../../.env' });
const mongoose = require('mongoose');
const { Mood, Journal, Task, HealthLog, PsychTest } = require('../models/Inputs');
const User = require('../models/User');
const { generateDailySummary } = require('../modules/processing/dailySummary');
const { runWeeklyBatchForUser } = require('../jobs/scheduler');

async function seed() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to MongoDB');

  // Create test user
  let user = await User.findOne({ email: 'test@twin.ai' });
  if (!user) {
    user = await User.create({
      name: 'Test User',
      email: 'test@twin.ai',
      password: 'password123',
      age: 21,
      weight: 65,
      gender: 'male'
    });
    console.log('Test user created:', user._id);
  }

  const userId = user._id;

  // Generate 30 days of synthetic data
  const today = new Date();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const date = d.toISOString().split('T')[0];

    // Simulate a realistic pattern:
    // - Low sleep → low mood (correlation we want to detect)
    // - Weekends have better mood
    const isWeekend = d.getDay() === 0 || d.getDay() === 6;
    const sleepHours = isWeekend ? 7 + Math.random() * 2 : 4 + Math.random() * 3;
    const moodScore  = Math.round(sleepHours > 6 ? 5 + Math.random() * 4 : 2 + Math.random() * 3);
    const steps      = Math.round(3000 + Math.random() * 7000);
    const exercise   = isWeekend ? Math.round(Math.random() * 60) : Math.round(Math.random() * 30);
    const screenTime = sleepHours < 5 ? 5 + Math.random() * 3 : 2 + Math.random() * 3;

    await Mood.findOneAndUpdate(
      { userId, date },
      { score: moodScore, text: moodScore <= 3 ? 'Feeling low and tired' : moodScore >= 7 ? 'Feeling good today' : 'Normal day' },
      { upsert: true }
    );

    await Journal.findOneAndUpdate(
      { userId, date },
      { text: `Day ${30 - i}: Sleep was ${sleepHours.toFixed(1)}h. Mood felt ${moodScore <= 4 ? 'rough' : 'okay'}. ${exercise > 0 ? 'Did some exercise.' : 'Skipped exercise today.'}` },
      { upsert: true }
    );

    await HealthLog.findOneAndUpdate(
      { userId, date },
      { sleepHours: parseFloat(sleepHours.toFixed(1)), steps, exerciseMinutes: exercise, screenTimeHours: parseFloat(screenTime.toFixed(1)) },
      { upsert: true }
    );

    // Tasks — 3 tasks per day, randomly completed
    const existingTasks = await Task.find({ userId, date });
    if (existingTasks.length === 0) {
      for (let t = 0; t < 3; t++) {
        await Task.create({
          userId, date,
          title: [`Study session`, `Exercise`, `Read chapter`][t],
          done: Math.random() > 0.4,
          completedAt: Math.random() > 0.4 ? new Date(date) : null
        });
      }
    }

    // Weekly psych test
    if (d.getDay() === 0) {
      const weekYear = getWeekYear(date);
      const stressScore = moodScore <= 3 ? 14 + Math.round(Math.random() * 7) : 4 + Math.round(Math.random() * 6);
      await PsychTest.findOneAndUpdate(
        { userId, weekYear },
        {
          date, weekYear,
          answers: Array(7).fill(0).map(() => ({ question: 'GAD-7', score: Math.round(stressScore / 7) })),
          totalScore: stressScore,
          anxietyLevel: stressScore <= 4 ? 'minimal' : stressScore <= 9 ? 'mild' : stressScore <= 14 ? 'moderate' : 'severe'
        },
        { upsert: true }
      );
    }

    // Generate daily summary
    await generateDailySummary(userId, date);
    process.stdout.write('.');
  }

  console.log('\n30 days of data seeded');

  // Run weekly batch to generate knowledge + patterns
  console.log('Running weekly batch to build knowledge table...');
  await runWeeklyBatchForUser(userId);

  console.log('\nDone! Test credentials:');
  console.log('Email:    test@twin.ai');
  console.log('Password: password123');
  console.log('User ID: ', userId.toString());

  process.exit(0);
}

function getWeekYear(dateStr) {
  const d = new Date(dateStr);
  const jan1 = new Date(d.getFullYear(), 0, 1);
  const week = Math.ceil(((d - jan1) / 86400000 + jan1.getDay() + 1) / 7);
  return `${d.getFullYear()}-W${String(week).padStart(2, '0')}`;
}

seed().catch(err => { console.error(err); process.exit(1); });
