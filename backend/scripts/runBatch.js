// Runs the weekly pipeline by hand.
// Usage (from backend/):
//   npm run batch                         → last completed week, all users
//   npm run batch -- 2026-06-22           → the week containing that date, all users
//   npm run batch -- 2026-06-22 me@x.com  → that week, one user

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const { loadConfig, config } = require('../src/config/env');
const User = require('../src/models/User');
const { runWeeklyBatchForUser } = require('../src/modules/processing/weeklyBatch');
const { getWeekRange, isValidDateString } = require('../src/utils/dateUtils');

async function run() {
  loadConfig();
  const [dateArg, emailArg] = process.argv.slice(2);
  if (dateArg && !isValidDateString(dateArg)) throw new Error('Date must be YYYY-MM-DD');

  await mongoose.connect(config.mongoUri);
  const users = await User.find(emailArg ? { email: emailArg.toLowerCase() } : {});
  if (!users.length) throw new Error('No matching users');

  for (const user of users) {
    const result = await runWeeklyBatchForUser(user, dateArg ? getWeekRange(dateArg) : undefined);
    console.log(`${user.email}: ${result.weekYear} (${result.startDate} → ${result.endDate}) — ${result.patterns} pattern(s), ${result.episodes} episode(s)`);
  }
  await mongoose.disconnect();
}

run().catch(err => { console.error(err.message); process.exit(1); });
