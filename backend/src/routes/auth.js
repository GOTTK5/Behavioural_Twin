const express = require('express');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const User = require('../models/User');
const { protect } = require('../middleware/auth');
const { config } = require('../config/env');
const { HttpError, asyncHandler, optionalNumber, requiredString } = require('../utils/http');
const { isValidTimezone } = require('../utils/dateUtils');
const { deleteAllUserData, exportUserData } = require('../services/accountService');
const { sendEmail, passwordResetEmail } = require('../services/email');
const { createOneTimeToken, hashToken } = require('../utils/tokens');

const router = express.Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts — please try again in a few minutes' }
});

const resetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many reset requests — please try again in an hour' }
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 8;
const RESET_MINUTES = 30;

function validateNewPassword(password) {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD) {
    throw new HttpError(400, `Password must be at least ${MIN_PASSWORD} characters`);
  }
  if (password.length > 200) throw new HttpError(400, 'Password is too long');
  return password;
}
const GENDERS = ['male', 'female', 'other', 'prefer_not_to_say'];

function signToken(id) {
  return jwt.sign({ id }, config.jwtSecret, { expiresIn: config.jwtExpiresIn });
}

function parseProfile(body) {
  const profile = {};
  if (body.age !== undefined)    profile.age = optionalNumber(body.age, 'age', { min: 1, max: 120, integer: true });
  if (body.weight !== undefined) profile.weight = optionalNumber(body.weight, 'weight', { min: 1, max: 500 });
  if (body.gender !== undefined) {
    if (!GENDERS.includes(body.gender)) throw new HttpError(400, 'Invalid gender');
    profile.gender = body.gender;
  }
  if (body.timezone !== undefined) {
    if (!isValidTimezone(body.timezone)) throw new HttpError(400, 'Invalid timezone');
    profile.timezone = body.timezone;
  }
  return profile;
}

router.post('/register', authLimiter, asyncHandler(async (req, res) => {
  const name = requiredString(req.body.name, 'name', { max: 100 });
  const email = requiredString(req.body.email, 'email', { max: 200 }).toLowerCase();
  if (!EMAIL_RE.test(email)) throw new HttpError(400, 'Please enter a valid email');
  const password = validateNewPassword(req.body.password);

  if (await User.exists({ email })) throw new HttpError(400, 'Email already registered');

  const user = await User.create({ name, email, password, ...parseProfile(req.body) });
  res.status(201).json({ token: signToken(user._id), user: user.toPublicJSON() });
}));

router.post('/login', authLimiter, asyncHandler(async (req, res) => {
  const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const user = email ? await User.findOne({ email }).select('+password') : null;
  if (!user || !(await user.matchPassword(req.body.password))) {
    throw new HttpError(401, 'Invalid email or password');
  }
  res.json({ token: signToken(user._id), user: user.toPublicJSON() });
}));

// Same response whether or not the account exists.
router.post('/forgot-password', resetLimiter, asyncHandler(async (req, res) => {
  const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  if (!EMAIL_RE.test(email)) throw new HttpError(400, 'Please enter a valid email');

  const user = await User.findOne({ email });
  if (user) {
    const { token, hash } = createOneTimeToken();
    user.passwordResetTokenHash = hash;
    user.passwordResetExpires = new Date(Date.now() + RESET_MINUTES * 60 * 1000);
    await user.save();

    const link = `${config.appUrl}/reset-password?token=${token}`;
    try {
      await sendEmail({ to: user.email, toName: user.name, ...passwordResetEmail({ name: user.name, link, minutes: RESET_MINUTES }) });
    } catch (err) {
      console.error('[auth] reset email failed:', err.message);
    }
  }

  res.json({ message: `If an account exists for ${email}, a reset link has been sent. It expires in ${RESET_MINUTES} minutes — check your spam folder too.` });
}));

router.post('/reset-password', authLimiter, asyncHandler(async (req, res) => {
  const token = typeof req.body.token === 'string' ? req.body.token.trim() : '';
  const password = validateNewPassword(req.body.password);
  if (!/^[a-f0-9]{64}$/.test(token)) throw new HttpError(400, 'This reset link is invalid or has expired — please request a new one.');

  const user = await User.findOne({
    passwordResetTokenHash: hashToken(token),
    passwordResetExpires: { $gt: new Date() }
  }).select('+passwordResetTokenHash +passwordResetExpires');
  if (!user) throw new HttpError(400, 'This reset link is invalid or has expired — please request a new one.');

  user.password = password;
  user.passwordResetTokenHash = undefined;
  user.passwordResetExpires = undefined;
  await user.save();

  res.json({ token: signToken(user._id), user: user.toPublicJSON() });
}));

router.put('/password', protect, authLimiter, asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select('+password');
  if (!(await user.matchPassword(req.body.currentPassword))) {
    throw new HttpError(403, 'Current password is incorrect'); // not 401: would log the user out
  }
  const newPassword = validateNewPassword(req.body.newPassword);
  if (newPassword === req.body.currentPassword) throw new HttpError(400, 'New password must be different from the current one');

  user.password = newPassword;
  await user.save();
  res.json({ token: signToken(user._id), message: 'Password changed. Other devices have been signed out.' });
}));

router.get('/me', protect, (req, res) => {
  res.json({ user: req.user.toPublicJSON() });
});

router.put('/profile', protect, asyncHandler(async (req, res) => {
  const update = parseProfile(req.body);
  if (req.body.name !== undefined) update.name = requiredString(req.body.name, 'name', { max: 100 });
  const user = await User.findByIdAndUpdate(req.user._id, update, { new: true, runValidators: true });
  res.json({ user: user.toPublicJSON() });
}));

router.get('/export', protect, asyncHandler(async (req, res) => {
  const data = await exportUserData(req.user._id);
  res.setHeader('Content-Disposition', 'attachment; filename="twin-data-export.json"');
  res.json({ exportedAt: new Date().toISOString(), user: req.user.toPublicJSON(), ...data });
}));

router.delete('/account', protect, asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select('+password');
  if (!(await user.matchPassword(req.body?.password))) {
    throw new HttpError(403, 'Password is incorrect');
  }
  await deleteAllUserData(user._id);
  res.json({ success: true });
}));

module.exports = router;
