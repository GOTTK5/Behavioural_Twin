const express = require('express');
const { protect } = require('../middleware/auth');
const { buildContext } = require('../modules/conversation/contextEngine');
const { callLLM } = require('../modules/conversation/llmCall');
const ChatMessage = require('../models/ChatMessage');

const router = express.Router();
router.use(protect);

// GET /api/chat/history — load persisted conversation on page load
router.get('/history', async (req, res) => {
  try {
    const messages = await ChatMessage.find({ userId: req.user._id })
      .sort({ createdAt: 1 })
      .limit(50); // keep the most recent 50 messages for context + display

    res.json({ messages });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/chat
router.post('/', async (req, res) => {
  try {
    const { message } = req.body;
    const userId = req.user._id;

    if (!message?.trim()) {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Pull last 10 turns (20 messages) from MongoDB for LLM context —
    // persisted history, not an in-memory store that resets on navigation/restart.
    const recentMessages = await ChatMessage.find({ userId })
      .sort({ createdAt: -1 })
      .limit(20);
    const history = recentMessages
      .reverse()
      .map(m => ({ role: m.role, content: m.content }));

    // Build behavioral context using RAG
    const contextPackage = await buildContext(userId, message);

    // Call LLM
    const reply = await callLLM(message, contextPackage, history);

    // Persist both turns to MongoDB
    await ChatMessage.create({ userId, role: 'user', content: message });
    await ChatMessage.create({ userId, role: 'assistant', content: reply });

    res.json({
      reply,
      contextUsed: {
        hasPatterns: contextPackage.behavioralPatterns.length > 0,
        hasSimilarWeeks: contextPackage.similarPastWeeks.length > 0,
        hasEpisodes: contextPackage.significantEpisodes.length > 0
      }
    });
  } catch (err) {
    console.error('Chat error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/chat/history — clear conversation history
router.delete('/history', async (req, res) => {
  try {
    await ChatMessage.deleteMany({ userId: req.user._id });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;