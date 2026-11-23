const crypto = require('crypto');

// One-time tokens (e.g. password reset). Only the SHA-256 hash is stored, so a
// database leak does not expose usable reset links.
function createOneTimeToken() {
  const token = crypto.randomBytes(32).toString('hex');
  return { token, hash: hashToken(token) };
}

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

module.exports = { createOneTimeToken, hashToken };
