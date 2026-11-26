// Creates test@twin.ai with 35 days of synthetic data and runs the weekly analysis.

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const { loadConfig, config } = require('../src/config/env');
const { Mood, Journal, Task, HealthLog, PsychTest } = require('../src/models/Inputs');
const User = require('../src/models/User');
const { generateDailySummary } = require('../src/modules/processing/dailySummary');
const { runWeeklyBatchForUser } = require('../src/modules/processing/weeklyBatch');
const { getLocalDateString, addDays, weekdayIndex, getWeekYear, getWeekRange } = require('../src/utils/dateUtils');

const DEMO_EMAIL = 'test@twin.ai';
const DEMO_PASSWORD = 'password123';
const DAYS = 35;

async function seed() {
  loadConfig();
  if (config.isProduction && process.env.ALLOW_SEED !== 'true') {
    throw new Error('Refusing to seed in production. Set ALLOW_SEED=true if you really mean it.');
  }
  await mongoose.connect(config.mongoUri);
  console.log('Connected to MongoDB');

  let user = await User.findOne({ email: DEMO_EMAIL });
  if (!user) {
    user = await User.create({ name: 'Test User', email: DEMO_EMAIL, password: DEMO_PASSWORD, age: 21, weight: 65, gender: 'male' });
    console.log('Demo user created');
  }
  const userId = user._id;
  const today = getLocalDateString(user.timezone);

  for (let i = DAYS - 1; i >= 0; i--) {
    const date = addDays(today, -i);
    const isWeekend = weekdayIndex(date) >= 5;

    // Built-in pattern to discover: less sleep → lower mood, more screen time
    const sleepHours = isWeekend ? 7 + Math.random() * 2 : 4 + Math.random() * 3;
    const moodScore  = Math.round(sleepHours > 6 ? 5 + Math.random() * 4 : 2 + Math.random() * 2);
    const steps      = Math.round(3000 + Math.random() * 7000);
    const exercise   = isWeekend ? Math.round(Math.random() * 60) : Math.round(Math.random() * 30);
    const screenTime = sleepHours < 5 ? 5 + Math.random() * 3 : 2 + Math.random() * 3;

    await Mood.findOneAndUpdate({ userId, date },
      { score: moodScore, text: moodScore <= 3 ? 'Feeling low and tired' : moodScore >= 7 ? 'Feeling good today' : 'Normal day' },
      { upsert: true });

    await Journal.findOneAndUpdate({ userId, date },
      { text: `Sleep was ${sleepHours.toFixed(1)}h. Mood felt ${moodScore <= 4 ? 'rough' : 'okay'}. ${exercise > 0 ? 'Did some exercise.' : 'Skipped exercise today.'}` },
      { upsert: true });

    await HealthLog.findOneAndUpdate({ userId, date }, {
      sleepHours: +sleepHours.toFixed(1), steps, exerciseMinutes: exercise, screenTimeHours: +screenTime.toFixed(1)
    }, { upsert: true });

    if (!(await Task.exists({ userId, date }))) {
      const doneChance = moodScore >= 5 ? 0.8 : 0.3;
      await Task.insertMany(['Study session', 'Exercise', 'Read chapter'].map(title => {
        const done = Math.random() < doneChance;
        return { userId, date, title, done, completedAt: done ? new Date(`${date}T18:00:00Z`) : null };
      }));
    }

    if (weekdayIndex(date) === 6) {
      const total = moodScore <= 3 ? 12 + Math.round(Math.random() * 6) : 3 + Math.round(Math.random() * 5);
      const answers = Array.from({ length: 7 }, (_, q) => Math.min(3, Math.floor(total / 7) + (q < total % 7 ? 1 : 0)));
      await PsychTest.findOneAndUpdate({ userId, weekYear: getWeekYear(date) }, {
        date, weekYear: getWeekYear(date),
        answers: answers.map((score, q) => ({ question: `GAD-7 Q${q + 1}`, score })),
        totalScore: answers.reduce((a, b) => a + b, 0),
        anxietyLevel: total <= 4 ? 'minimal' : total <= 9 ? 'mild' : total <= 14 ? 'moderate' : 'severe'
      }, { upsert: true });
    }
  }

  for (let i = DAYS - 1; i >= 0; i--) await generateDailySummary(userId, addDays(today, -i));
  console.log(`${DAYS} days of data seeded`);

  // Process every completed week in the range, oldest first
  const lastCompleted = getWeekRange(addDays(getWeekRange(today).startDate, -7));
  for (let start = getWeekRange(addDays(today, -(DAYS - 1))).startDate; start <= lastCompleted.startDate; start = addDays(start, 7)) {
    const result = await runWeeklyBatchForUser(user, getWeekRange(start));
    console.log(`Processed ${result.weekYear}: ${result.patterns} pattern(s), ${result.episodes} episode(s)`);
  }

  console.log(`\nDone! Sign in with ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
  await mongoose.disconnect();
}

seed().catch(err => { console.error(err.message); process.exit(1); });
