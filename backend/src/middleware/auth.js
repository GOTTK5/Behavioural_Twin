const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { config } = require('../config/env');

async function protect(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Not authorized — no token' });
  }
  let decoded;
  try {
    decoded = jwt.verify(auth.slice(7), config.jwtSecret);
    if (decoded.purpose) throw new Error('wrong token type'); // e.g. an OAuth state token
    req.user = await User.findById(decoded.id);
  } catch {
    return res.status(401).json({ error: 'Session expired — please sign in again' });
  }
  if (!req.user) return res.status(401).json({ error: 'User not found' });
  if (req.user.tokenIssuedBeforePasswordChange(decoded.iat)) {
    return res.status(401).json({ error: 'Your password was changed — please sign in again' });
  }
  next();
}

module.exports = { protect };
