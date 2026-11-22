const express = require('express');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const User = require('../models/User');
const { protect } = require('../middleware/auth');
const { config } = require('../config/env');
const { HttpError, asyncHandler, optionalNumber, requiredString } = require('../utils/http');
const { isValidTimezone } = require('../utils/dateUtils');
const { deleteAllUserData, exportUserData } = require('../services/accountService');

const router = express.Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts — please try again in a few minutes' }
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
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

// POST /api/auth/register
router.post('/register', authLimiter, asyncHandler(async (req, res) => {
  const name = requiredString(req.body.name, 'name', { max: 100 });
  const email = requiredString(req.body.email, 'email', { max: 200 }).toLowerCase();
  if (!EMAIL_RE.test(email)) throw new HttpError(400, 'Please enter a valid email');
  const password = req.body.password;
  if (typeof password !== 'string' || password.length < 8) {
    throw new HttpError(400, 'Password must be at least 8 characters');
  }

  if (await User.exists({ email })) throw new HttpError(400, 'Email already registered');

  const user = await User.create({ name, email, password, ...parseProfile(req.body) });
  res.status(201).json({ token: signToken(user._id), user: user.toPublicJSON() });
}));

// POST /api/auth/login
router.post('/login', authLimiter, asyncHandler(async (req, res) => {
  const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const user = email ? await User.findOne({ email }).select('+password') : null;
  if (!user || !(await user.matchPassword(req.body.password))) {
    throw new HttpError(401, 'Invalid email or password');
  }
  res.json({ token: signToken(user._id), user: user.toPublicJSON() });
}));

// GET /api/auth/me
router.get('/me', protect, (req, res) => {
  res.json({ user: req.user.toPublicJSON() });
});

// PUT /api/auth/profile
router.put('/profile', protect, asyncHandler(async (req, res) => {
  const update = parseProfile(req.body);
  if (req.body.name !== undefined) update.name = requiredString(req.body.name, 'name', { max: 100 });
  const user = await User.findByIdAndUpdate(req.user._id, update, { new: true, runValidators: true });
  res.json({ user: user.toPublicJSON() });
}));

// GET /api/auth/export — download everything stored about the user as JSON
router.get('/export', protect, asyncHandler(async (req, res) => {
  const data = await exportUserData(req.user._id);
  res.setHeader('Content-Disposition', 'attachment; filename="twin-data-export.json"');
  res.json({ exportedAt: new Date().toISOString(), user: req.user.toPublicJSON(), ...data });
}));

// DELETE /api/auth/account — permanently deletes the user and all their data
router.delete('/account', protect, asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select('+password');
  if (!(await user.matchPassword(req.body?.password))) {
    throw new HttpError(403, 'Password is incorrect');
  }
  await deleteAllUserData(user._id);
  res.json({ success: true });
}));

module.exports = router;
