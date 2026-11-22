// Google Fit sync (optional). NOTE: Google is winding down the Fitness REST API —
// check its status before relying on it in production.

const { google } = require('googleapis');
const User = require('../models/User');
const { HealthLog } = require('../models/Inputs');
const { config } = require('../config/env');
const { zonedMidnightMs, addDays } = require('../utils/dateUtils');

function getOAuthClient() {
  return new google.auth.OAuth2(config.google.clientId, config.google.clientSecret, config.google.redirectUri);
}

function isInvalidGrant(err) {
  return /invalid_grant/i.test(err?.message || '') || err?.response?.data?.error === 'invalid_grant';
}

// Fetches steps and sleep for one local calendar day.
// Sleep is attributed to the day the user WOKE UP (session ended that day).
async function fetchGoogleFitData(user, dateStr) {
  const withTokens = user.googleRefreshToken !== undefined
    ? user
    : await User.findById(user._id).select('+googleAccessToken +googleRefreshToken');

  const oauth2Client = getOAuthClient();
  oauth2Client.setCredentials({
    access_token: withTokens.googleAccessToken,
    refresh_token: withTokens.googleRefreshToken
  });
  // Persist refreshed access tokens so we don't refresh on every call
  oauth2Client.on('tokens', (tokens) => {
    const update = {};
    if (tokens.access_token) update.googleAccessToken = tokens.access_token;
    if (tokens.refresh_token) update.googleRefreshToken = tokens.refresh_token;
    if (Object.keys(update).length) User.updateOne({ _id: user._id }, update).catch(() => {});
  });

  const fitness = google.fitness({ version: 'v1', auth: oauth2Client });
  const tz = user.timezone || config.defaultTimezone;
  const startMs = zonedMidnightMs(dateStr, tz);
  const endMs = zonedMidnightMs(addDays(dateStr, 1), tz);

  let steps = null;
  try {
    const stepsRes = await fitness.users.dataset.aggregate({
      userId: 'me',
      requestBody: {
        aggregateBy: [{ dataTypeName: 'com.google.step_count.delta' }],
        bucketByTime: { durationMillis: endMs - startMs },
        startTimeMillis: startMs,
        endTimeMillis: endMs
      }
    });
    const points = stepsRes.data.bucket?.[0]?.dataset?.[0]?.point || [];
    if (points.length) steps = points.reduce((sum, p) => sum + (p.value?.[0]?.intVal || 0), 0);
  } catch (err) {
    if (isInvalidGrant(err)) throw err;
    console.error('[googleFit] steps fetch failed:', err.message);
  }

  let sleepHours = null;
  try {
    const sleepRes = await fitness.users.sessions.list({
      userId: 'me',
      startTime: new Date(startMs - 12 * 3600000).toISOString(), // sessions starting the evening before
      endTime: new Date(endMs).toISOString(),
      activityType: 72 // sleep
    });
    const sessions = (sleepRes.data.session || []).filter(s => {
      const end = parseInt(s.endTimeMillis, 10);
      return end > startMs && end <= endMs;
    });
    if (sessions.length) {
      const totalMs = sessions.reduce((acc, s) => acc + (parseInt(s.endTimeMillis, 10) - parseInt(s.startTimeMillis, 10)), 0);
      sleepHours = parseFloat((totalMs / 3600000).toFixed(1));
    }
  } catch (err) {
    if (isInvalidGrant(err)) throw err;
    console.error('[googleFit] sleep fetch failed:', err.message);
  }

  return { steps, sleepHours };
}

// Never overwrites a value with null, and never overwrites a manual entry.
async function safeUpdateHealthLog(userId, date, data) {
  const existing = await HealthLog.findOne({ userId, date });
  const update = {};

  if (data.sleepHours != null && existing?.source?.sleep !== 'manual') {
    update.sleepHours = data.sleepHours;
    update['source.sleep'] = 'google_fit';
  }
  if (data.steps != null && existing?.source?.steps !== 'manual') {
    update.steps = data.steps;
    update['source.steps'] = 'google_fit';
  }

  if (!Object.keys(update).length) return existing || null;
  return HealthLog.findOneAndUpdate({ userId, date }, update, { upsert: true, new: true });
}

// Sync one day; marks the user disconnected when Google revoked access.
async function syncDay(user, date) {
  try {
    const data = await fetchGoogleFitData(user, date);
    const log = await safeUpdateHealthLog(user._id, date, data);
    return { data, log };
  } catch (err) {
    if (isInvalidGrant(err)) {
      await User.updateOne({ _id: user._id }, { googleConnected: false });
      err.needsReconnect = true;
    }
    throw err;
  }
}

module.exports = { getOAuthClient, fetchGoogleFitData, safeUpdateHealthLog, syncDay };
