// const express = require('express');
// const { google } = require('googleapis');
// const { protect } = require('../middleware/auth');
// const User = require('../models/User');
// const { HealthLog } = require('../models/Inputs');

// const router = express.Router();

// function getOAuthClient() {
//   return new google.auth.OAuth2(
//     process.env.GOOGLE_CLIENT_ID,
//     process.env.GOOGLE_CLIENT_SECRET,
//     process.env.GOOGLE_REDIRECT_URI
//   );
// }

// // GET /api/google/auth-url — get Google OAuth URL
// router.get('/auth-url', protect, (req, res) => {
//   const oauth2Client = getOAuthClient();
//   const url = oauth2Client.generateAuthUrl({
//     access_type: 'offline',
//     scope: [
//       'https://www.googleapis.com/auth/fitness.sleep.read',
//       'https://www.googleapis.com/auth/fitness.activity.read'
//     ],
//     state: req.user._id.toString()
//   });
//   res.json({ url });
// });

// // GET /api/google/callback — OAuth callback
// router.get('/callback', async (req, res) => {
//   try {
//     const { code, state: userId } = req.query;
//     const oauth2Client = getOAuthClient();
//     const { tokens } = await oauth2Client.getToken(code);

//     await User.findByIdAndUpdate(userId, {
//       googleAccessToken: tokens.access_token,
//       googleRefreshToken: tokens.refresh_token,
//       googleConnected: true
//     });

//     res.redirect(`${process.env.FRONTEND_URL}/profile?google=connected`);
//   } catch (err) {
//     res.redirect(`${process.env.FRONTEND_URL}/profile?google=error`);
//   }
// });

// // POST /api/google/sync — manually trigger a sync for a date
// router.post('/sync', protect, async (req, res) => {
//   try {
//     const user = await User.findById(req.user._id);
//     if (!user.googleConnected) {
//       return res.status(400).json({ error: 'Google Fit not connected' });
//     }

//     const { date } = req.body; // YYYY-MM-DD
//     const data = await fetchGoogleFitData(user, date);

//     const log = await HealthLog.findOneAndUpdate(
//       { userId: user._id, date },
//       {
//         sleepHours: data.sleepHours,
//         steps: data.steps,
//         'source.sleep': 'google_fit',
//         'source.steps': 'google_fit'
//       },
//       { upsert: true, new: true }
//     );

//     res.json({ log, synced: data });
//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// });

// // GET /api/google/status
// router.get('/status', protect, async (req, res) => {
//   const user = await User.findById(req.user._id).select('googleConnected');
//   res.json({ connected: user.googleConnected });
// });

// // ── Core Google Fit fetch ─────────────────────────────
// async function fetchGoogleFitData(user, dateStr) {
//   const oauth2Client = getOAuthClient();
//   oauth2Client.setCredentials({
//     access_token: user.googleAccessToken,
//     refresh_token: user.googleRefreshToken
//   });

//   const fitness = google.fitness({ version: 'v1', auth: oauth2Client });

//   const startMs = new Date(dateStr).getTime();
//   const endMs   = startMs + 86400000;

//   // Steps
//   let steps = null;
//   try {
//     const stepsRes = await fitness.users.dataset.aggregate({
//       userId: 'me',
//       requestBody: {
//         aggregateBy: [{ dataTypeName: 'com.google.step_count.delta' }],
//         bucketByTime: { durationMillis: 86400000 },
//         startTimeMillis: startMs,
//         endTimeMillis: endMs
//       }
//     });
//     const bucket = stepsRes.data.bucket?.[0];
//     steps = bucket?.dataset?.[0]?.point?.[0]?.value?.[0]?.intVal || 0;
//   } catch (err) {
//     console.error('Error fetching Google Fit steps:', err);
//   }

//   // Sleep
//   let sleepHours = null;
//   try {
//     const sleepRes = await fitness.users.sessions.list({
//       userId: 'me',
//       startTime: new Date(startMs).toISOString(),
//       endTime: new Date(endMs).toISOString(),
//       activityType: 72 // sleep
//     });
//     const sessions = sleepRes.data.session || [];
//     const totalMs = sessions.reduce((acc, s) => {
//       return acc + (parseInt(s.endTimeMillis) - parseInt(s.startTimeMillis));
//     }, 0);
//     sleepHours = parseFloat((totalMs / 3600000).toFixed(1));
//   } catch (err) {
//     console.error('Error fetching Google Fit sleep data:', err);
//   }

//   return { steps, sleepHours };
// }

// // Export for cron job use
// module.exports = router;
// module.exports.fetchGoogleFitData = fetchGoogleFitData;



const express = require('express');
const { google } = require('googleapis');
const { protect } = require('../middleware/auth');
const User = require('../models/User');
const { HealthLog } = require('../models/Inputs');

const router = express.Router();

function getOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

// GET /api/google/auth-url — get Google OAuth URL
router.get('/auth-url', protect, (req, res) => {
  const oauth2Client = getOAuthClient();
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent', // forces a fresh refresh token every time, avoids silent reuse of an expired one
    scope: [
      'https://www.googleapis.com/auth/fitness.sleep.read',
      'https://www.googleapis.com/auth/fitness.activity.read'
    ],
    state: req.user._id.toString()
  });
  res.json({ url });
});

// GET /api/google/callback — OAuth callback
router.get('/callback', async (req, res) => {
  try {
    const { code, state: userId } = req.query;
    const oauth2Client = getOAuthClient();
    const { tokens } = await oauth2Client.getToken(code);

    await User.findByIdAndUpdate(userId, {
      googleAccessToken: tokens.access_token,
      googleRefreshToken: tokens.refresh_token,
      googleConnected: true
    });

    res.redirect(`${process.env.FRONTEND_URL}/profile?google=connected`);
  } catch (err) {
    res.redirect(`${process.env.FRONTEND_URL}/profile?google=error`);
  }
});

// POST /api/google/disconnect — clear stored tokens so user can reconnect fresh
router.post('/disconnect', protect, async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.user._id, {
      googleAccessToken: null,
      googleRefreshToken: null,
      googleConnected: false
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/google/sync — manually trigger a sync for a date
router.post('/sync', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user.googleConnected) {
      return res.status(400).json({ error: 'Google Fit not connected' });
    }

    const { date } = req.body; // YYYY-MM-DD
    const data = await fetchGoogleFitData(user, date);

    const log = await safeUpdateHealthLog(user._id, date, data);

    res.json({ log, synced: data });
  } catch (err) {
    // invalid_grant means the refresh token expired/was revoked — tell the frontend clearly
    if (err.message?.includes('invalid_grant')) {
      await User.findByIdAndUpdate(user._id, { googleConnected: false });
      return res.status(401).json({ error: 'Google Fit session expired. Please reconnect.', needsReconnect: true });
    }
    res.status(500).json({ error: err.message });
  }
});

// GET /api/google/status
router.get('/status', protect, async (req, res) => {
  const user = await User.findById(req.user._id).select('googleConnected');
  res.json({ connected: user.googleConnected });
});

// ── Safe write helper ──────────────────────────────────
// Never overwrites a value with null, and never overwrites a manual entry
// with a Google Fit value unless that field was already sourced from Google Fit.
async function safeUpdateHealthLog(userId, date, data) {
  const existing = await HealthLog.findOne({ userId, date });

  const updateFields = {};

  const sleepIsManual = existing?.source?.sleep === 'manual';
  if (data.sleepHours != null && !sleepIsManual) {
    updateFields.sleepHours = data.sleepHours;
    updateFields['source.sleep'] = 'google_fit';
  }

  const stepsIsManual = existing?.source?.steps === 'manual';
  if (data.steps != null && !stepsIsManual) {
    updateFields.steps = data.steps;
    updateFields['source.steps'] = 'google_fit';
  }

  // Nothing safe to write — return existing record unchanged instead of upserting an empty doc
  if (Object.keys(updateFields).length === 0) {
    return existing || null;
  }

  return await HealthLog.findOneAndUpdate(
    { userId, date },
    updateFields,
    { upsert: true, new: true }
  );
}

// ── Core Google Fit fetch ─────────────────────────────
async function fetchGoogleFitData(user, dateStr) {
  const oauth2Client = getOAuthClient();
  oauth2Client.setCredentials({
    access_token: user.googleAccessToken,
    refresh_token: user.googleRefreshToken
  });

  const fitness = google.fitness({ version: 'v1', auth: oauth2Client });

  const startMs = new Date(dateStr).getTime();
  const endMs   = startMs + 86400000;

  // Steps
  let steps = null;
  try {
    const stepsRes = await fitness.users.dataset.aggregate({
      userId: 'me',
      requestBody: {
        aggregateBy: [{ dataTypeName: 'com.google.step_count.delta' }],
        bucketByTime: { durationMillis: 86400000 },
        startTimeMillis: startMs,
        endTimeMillis: endMs
      }
    });
    const bucket = stepsRes.data.bucket?.[0];
    steps = bucket?.dataset?.[0]?.point?.[0]?.value?.[0]?.intVal ?? null;
  } catch (err) {
    console.error('Error fetching Google Fit steps:', err.message || err);
    if (err.message?.includes('invalid_grant')) throw err; // bubble up so /sync can flag reconnect
  }

  // Sleep
  let sleepHours = null;
  try {
    const sleepRes = await fitness.users.sessions.list({
      userId: 'me',
      startTime: new Date(startMs).toISOString(),
      endTime: new Date(endMs).toISOString(),
      activityType: 72 // sleep
    });
    const sessions = sleepRes.data.session || [];
    if (sessions.length > 0) {
      const totalMs = sessions.reduce((acc, s) => {
        return acc + (parseInt(s.endTimeMillis) - parseInt(s.startTimeMillis));
      }, 0);
      sleepHours = parseFloat((totalMs / 3600000).toFixed(1));
    }
  } catch (err) {
    console.error('Error fetching Google Fit sleep data:', err.message || err);
    if (err.message?.includes('invalid_grant')) throw err;
  }

  return { steps, sleepHours };
}

// Export for cron job use
module.exports = router;
module.exports.fetchGoogleFitData = fetchGoogleFitData;
module.exports.safeUpdateHealthLog = safeUpdateHealthLog;