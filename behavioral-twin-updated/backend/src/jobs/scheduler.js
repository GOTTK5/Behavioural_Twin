const cron = require('node-cron');
const User = require('../models/User');
const { generateDailySummary } = require('../modules/processing/dailySummary');
const { generateWeeklySummary, embedKnowledgeInChroma, embedEpisodeInChroma } = require('../modules/processing/weeklySummary');
const { runCorrelationEngine, updateKnowledgeTable } = require('../modules/processing/correlation');
const { runEpisodeDetector } = require('../modules/processing/episodeDetector');
const { BehavioralKnowledge, Episode } = require('../models/Intelligence');
const { getLocalDateString } = require('../utils/dateUtils');

// Also try auto-sync Google Fit for connected users
const { fetchGoogleFitData } = require('../routes/google');
const { HealthLog } = require('../models/Inputs');

function startCronJobs() {

  // ── Daily at 11:55 PM — generate daily summary for all users ──
  cron.schedule('55 23 * * *', async () => {
    console.log('[CRON] Running daily summary job...');
    const today = getLocalDateString();
    const users = await User.find({});

    for (const user of users) {
      try {
        await generateDailySummary(user._id, today);

        // Auto-sync Google Fit if connected
        if (user.googleConnected) {
          const data = await fetchGoogleFitData(user, today);
          if (data.steps || data.sleepHours) {
            await HealthLog.findOneAndUpdate(
              { userId: user._id, date: today },
              {
                ...(data.steps      && { steps: data.steps, 'source.steps': 'google_fit' }),
                ...(data.sleepHours && { sleepHours: data.sleepHours, 'source.sleep': 'google_fit' })
              },
              { upsert: true }
            );
          }
        }
      } catch (err) {
        console.error(`Daily summary error for user ${user._id}:`, err.message);
      }
    }
    console.log('[CRON] Daily summary job complete');
  });

  // ── Every Sunday at 11:00 PM — full weekly batch ──
  cron.schedule('0 23 * * 0', async () => {
    console.log('[CRON] Running weekly batch job...');
    const users = await User.find({});
    const { startDate, endDate, weekYear } = getLastCompletedWeekRange();

    for (const user of users) {
      try {
        // 1. Generate weekly summary + embed in ChromaDB
        await generateWeeklySummary(user._id, weekYear, startDate, endDate);

        // 2. Run correlation engine
        const correlations = await runCorrelationEngine(user._id, weekYear, startDate, endDate);
        await updateKnowledgeTable(user._id, correlations, weekYear, startDate, endDate);

        // 3. Embed new knowledge patterns in ChromaDB
        const newPatterns = await BehavioralKnowledge.find({ userId: user._id, chromaEmbedded: false });
        for (const p of newPatterns) await embedKnowledgeInChroma(user._id, p);

        // 4. Run episode detector
        await runEpisodeDetector(user._id, startDate, endDate);

        // 5. Embed new episodes in ChromaDB
        const newEpisodes = await Episode.find({ userId: user._id, chromaEmbedded: false });
        for (const ep of newEpisodes) await embedEpisodeInChroma(user._id, ep);

        console.log(`[CRON] Weekly batch done for user ${user._id}`);
      } catch (err) {
        console.error(`Weekly batch error for user ${user._id}:`, err.message);
      }
    }
    console.log('[CRON] Weekly batch job complete');
  });

  console.log('[CRON] Jobs scheduled — daily at 23:55, weekly on Sundays at 23:00');
}

// ── Manual trigger endpoint for testing ──
async function runWeeklyBatchForUser(userId) {
  const { startDate, endDate, weekYear } = getLastCompletedWeekRange();
  await generateWeeklySummary(userId, weekYear, startDate, endDate);
  const correlations = await runCorrelationEngine(userId, weekYear, startDate, endDate);
  await updateKnowledgeTable(userId, correlations, weekYear, startDate, endDate);
  const newPatterns = await BehavioralKnowledge.find({ userId, chromaEmbedded: false });
  for (const p of newPatterns) await embedKnowledgeInChroma(userId, p);
  await runEpisodeDetector(userId, startDate, endDate);
  const newEpisodes = await Episode.find({ userId, chromaEmbedded: false });
  for (const ep of newEpisodes) await embedEpisodeInChroma(userId, ep);
  return { weekYear, startDate, endDate };
}

// Returns the most recently FULLY COMPLETED week (Monday–Sunday).
// This guarantees that no matter what day someone clicks "Run weekly batch now,"
// it always targets a finished week — never a partial, in-progress one.
function getLastCompletedWeekRange() {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0 = Sunday, 1 = Monday, ... 6 = Saturday

  const lastSunday = new Date(now);
  lastSunday.setDate(now.getDate() - dayOfWeek);

  const lastMonday = new Date(lastSunday);
  lastMonday.setDate(lastSunday.getDate() - 6);

  const fmt = (d) => d.toISOString().split('T')[0];
  const jan1 = new Date(lastMonday.getFullYear(), 0, 1);
  const week = Math.ceil(((lastMonday - jan1) / 86400000 + jan1.getDay() + 1) / 7);
  const weekYear = `${lastMonday.getFullYear()}-W${String(week).padStart(2, '0')}`;

  return { startDate: fmt(lastMonday), endDate: fmt(lastSunday), weekYear };
}

module.exports = { startCronJobs, runWeeklyBatchForUser };