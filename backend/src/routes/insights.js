const express = require('express');
const mongoose = require('mongoose');
const { protect } = require('../middleware/auth');
const { BehavioralKnowledge, Episode, WeeklySummary } = require('../models/Intelligence');
const { HttpError, asyncHandler } = require('../utils/http');

const router = express.Router();
router.use(protect);

router.get('/patterns', asyncHandler(async (req, res) => {
  const patterns = await BehavioralKnowledge.find({ userId: req.user._id })
    .sort({ confidenceRank: -1, observedWeeks: -1 })
    .select('-embedded');
  res.json({ patterns });
}));

router.get('/episodes', asyncHandler(async (req, res) => {
  const episodes = await Episode.find({ userId: req.user._id }).sort({ startDate: -1 }).select('-embedded');
  res.json({ episodes });
}));

router.patch('/episodes/:id/resolve', asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new HttpError(404, 'Episode not found');
  const episode = await Episode.findOneAndUpdate(
    { _id: req.params.id, userId: req.user._id },
    { resolved: true, resolvedByUser: true },
    { new: true }
  );
  if (!episode) throw new HttpError(404, 'Episode not found');
  res.json({ episode });
}));

router.get('/weekly-history', asyncHandler(async (req, res) => {
  const weeks = await WeeklySummary.find({ userId: req.user._id }).sort({ weekYear: -1 }).limit(20);
  res.json({ weeks });
}));

module.exports = router;
