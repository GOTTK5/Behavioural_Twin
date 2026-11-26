const cron = require('node-cron');
const User = require('../models/User');
const { generateDailySummary } = require('../modules/processing/dailySummary');
const { runWeeklyBatchForUser } = require('../modules/processing/weeklyBatch');
const { syncDay } = require('../services/googleFit');
const { config } = require('../config/env');
const { DailySummary, WeeklySummary } = require('../models/Intelligence');
const { getLocalDateString, getLocalHour, addDays, getLastCompletedWeekRange, getWeekRange } = require('../utils/dateUtils');

// Next week to process: the last completed week if unprocessed, else any stale week.
async function weeklyBatchDue(user, now) {
  const range = getLastCompletedWeekRange(user.timezone || config.defaultTimezone, now);
  const [processed, hasData] = await Promise.all([
    WeeklySummary.exists({ userId: user._id, weekYear: range.weekYear }),
    DailySummary.exists({ userId: user._id, date: { $gte: range.startDate, $lte: range.endDate } })
  ]);
  if (hasData && !processed) return range;

  const stale = await WeeklySummary.findOne({ userId: user._id, stale: true, endDate: { $lte: range.endDate } })
    .sort({ weekYear: 1 }).select('startDate').lean();
  return stale ? getWeekRange(stale.startDate) : null;
}

// Hourly, per user timezone: finalize yesterday after midnight, then run any due weekly batch.
async function hourlyTick(now = new Date()) {
  const users = await User.find({}).select('+googleAccessToken +googleRefreshToken');

  for (const user of users) {
    const tz = user.timezone || config.defaultTimezone;
    const localHour = getLocalHour(tz, now);
    const today = getLocalDateString(tz, now);

    try {
      if (localHour === 0) {
        const yesterday = addDays(today, -1);
        if (user.googleConnected && config.google.enabled) {
          try {
            await syncDay(user, yesterday);
          } catch (err) {
            console.error(`[cron] Google Fit sync failed for ${user._id}:`, err.message);
          }
        }
        await generateDailySummary(user._id, yesterday);
      }

      const dueRange = await weeklyBatchDue(user, now);
      if (dueRange) {
        const result = await runWeeklyBatchForUser(user, dueRange);
        console.log(`[cron] weekly batch ${result.weekYear} done for ${user._id}`);
      }
    } catch (err) {
      console.error(`[cron] job failed for user ${user._id}:`, err.message);
    }
  }
}

function startCronJobs() {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await hourlyTick();
    } catch (err) {
      console.error('[cron] tick failed:', err.message);
    } finally {
      running = false;
    }
  };
  cron.schedule('5 * * * *', tick);
  setTimeout(tick, 15000); // catch up after a restart
  console.log('[cron] scheduled hourly — daily finalize after local midnight, weekly batch once each week ends (each user\'s timezone)');
}

module.exports = { startCronJobs, hourlyTick, weeklyBatchDue };
