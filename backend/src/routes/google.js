const express = require('express');
const jwt = require('jsonwebtoken');
const { protect } = require('../middleware/auth');
const User = require('../models/User');
const { config } = require('../config/env');
const { getOAuthClient, syncDay } = require('../services/googleFit');
const { generateDailySummary } = require('../modules/processing/dailySummary');
const { HttpError, asyncHandler } = require('../utils/http');
const { resolveDate } = require('../utils/userDate');

const router = express.Router();

const SCOPES = [
  'https://www.googleapis.com/auth/fitness.sleep.read',
  'https://www.googleapis.com/auth/fitness.activity.read'
];

function requireGoogleConfigured(req, res, next) {
  if (!config.google.enabled) return next(new HttpError(503, 'Google Fit is not configured on this server'));
  next();
}

function frontendRedirect(res, status) {
  res.redirect(`${config.frontendUrl || ''}/profile?google=${status}`);
}

router.get('/auth-url', protect, requireGoogleConfigured, (req, res) => {
  // Signed state so the callback can trust the user id.
  const state = jwt.sign({ id: req.user._id.toString(), purpose: 'google_oauth' }, config.jwtSecret, { expiresIn: '10m' });
  const url = getOAuthClient().generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
    state
  });
  res.json({ url });
});

router.get('/callback', requireGoogleConfigured, async (req, res) => {
  try {
    const { code, state, error } = req.query;
    if (error || !code || !state) return frontendRedirect(res, 'error');

    const decoded = jwt.verify(state, config.jwtSecret);
    if (decoded.purpose !== 'google_oauth') throw new Error('bad state');

    const { tokens } = await getOAuthClient().getToken(code);
    const update = { googleAccessToken: tokens.access_token, googleConnected: true };
    if (tokens.refresh_token) update.googleRefreshToken = tokens.refresh_token;

    await User.updateOne({ _id: decoded.id }, update);
    frontendRedirect(res, 'connected');
  } catch (err) {
    console.error('[google] OAuth callback failed:', err.message);
    frontendRedirect(res, 'error');
  }
});

router.post('/disconnect', protect, asyncHandler(async (req, res) => {
  await User.updateOne({ _id: req.user._id }, {
    $unset: { googleAccessToken: 1, googleRefreshToken: 1 },
    googleConnected: false
  });
  res.json({ success: true });
}));

router.post('/sync', protect, requireGoogleConfigured, asyncHandler(async (req, res) => {
  if (!req.user.googleConnected) throw new HttpError(400, 'Google Fit is not connected');
  const date = resolveDate(req.user, req.body.date);

  try {
    const { data, log } = await syncDay(req.user, date);
    await generateDailySummary(req.user._id, date);
    res.json({ log, synced: data });
  } catch (err) {
    // 409, not 401, so the user stays signed in
    if (err.needsReconnect) throw new HttpError(409, 'Google Fit access expired — please reconnect.', { needsReconnect: true });
    throw err;
  }
}));

router.get('/status', protect, (req, res) => {
  res.json({ connected: Boolean(req.user.googleConnected), available: config.google.enabled });
});

module.exports = router;
