const express = require('express');
const rateLimit = require('express-rate-limit');
const { protect } = require('../middleware/auth');
const { buildContext } = require('../modules/conversation/contextEngine');
const { callLLM } = require('../modules/conversation/llmCall');
const { AIUnavailableError, describeError } = require('../modules/ai/gemini');
const ChatMessage = require('../models/ChatMessage');
const { HttpError, asyncHandler, requiredString } = require('../utils/http');
const { userToday } = require('../utils/userDate');

const router = express.Router();
router.use(protect);

const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 8,
  keyGenerator: (req) => req.user._id.toString(),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'You are sending messages too fast — wait a minute and try again.' }
});

const HISTORY_TURNS = 10;

router.get('/history', asyncHandler(async (req, res) => {
  const latest = await ChatMessage.find({ userId: req.user._id }).sort({ createdAt: -1 }).limit(50).lean();
  res.json({ messages: latest.reverse() });
}));

router.post('/', chatLimiter, asyncHandler(async (req, res) => {
  const message = requiredString(req.body.message, 'message', { max: 2000 });
  const userId = req.user._id;

  const recent = await ChatMessage.find({ userId }).sort({ createdAt: -1 }).limit(HISTORY_TURNS * 2).lean();
  const history = recent.reverse().map(m => ({ role: m.role, content: m.content }));

  const contextPackage = await buildContext(req.user, message, userToday(req.user));

  let reply;
  try {
    reply = await callLLM(message, contextPackage, history);
  } catch (err) {
    if (err instanceof AIUnavailableError) throw new HttpError(503, 'Twin is not configured yet — the server is missing GEMINI_API_KEY.');
    if (err.status === 429) throw new HttpError(429, 'The free AI quota is used up for now — please try again in a minute.');
    if ([500, 502, 503].includes(err.status) || err.name === 'TimeoutError') throw new HttpError(503, 'Google\'s AI servers are busy right now — please try again in a minute.');
    console.error('[chat] LLM error:', err.message);
    throw new HttpError(502, `Twin could not answer: ${describeError(err)}`);
  }

  await ChatMessage.insertMany([
    { userId, role: 'user', content: message },
    { userId, role: 'assistant', content: reply, createdAt: new Date(Date.now() + 1) }
  ]);

  res.json({
    reply,
    contextUsed: {
      hasPatterns: contextPackage.behavioralPatterns.length > 0,
      hasSimilarWeeks: contextPackage.similarPastWeeks.length > 0,
      hasEpisodes: contextPackage.relevantEpisodes.length > 0 || contextPackage.activeEpisodes.length > 0
    }
  });
}));

router.delete('/history', asyncHandler(async (req, res) => {
  await ChatMessage.deleteMany({ userId: req.user._id });
  res.json({ success: true });
}));

module.exports = router;
