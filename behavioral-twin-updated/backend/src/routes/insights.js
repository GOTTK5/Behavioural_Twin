const express = require('express');
const { protect } = require('../middleware/auth');
const { BehavioralKnowledge, Episode, WeeklySummary } = require('../models/Intelligence');

const router = express.Router();
router.use(protect);

// GET /api/insights/patterns
router.get('/patterns', async (req, res) => {
  try {
    const patterns = await BehavioralKnowledge.find({ userId: req.user._id })
      .sort({ observedWeeks: -1, confidence: -1 });
    res.json({ patterns });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/insights/episodes
router.get('/episodes', async (req, res) => {
  try {
    const episodes = await Episode.find({ userId: req.user._id })
      .sort({ startDate: -1 });
    res.json({ episodes });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/insights/episodes/:id/resolve
router.patch('/episodes/:id/resolve', async (req, res) => {
  try {
    const ep = await Episode.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id },
      { resolved: true },
      { new: true }
    );
    res.json({ episode: ep });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/insights/weekly-history
router.get('/weekly-history', async (req, res) => {
  try {
    const weeks = await WeeklySummary.find({ userId: req.user._id })
      .sort({ weekYear: -1 })
      .limit(20);
    res.json({ weeks });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
