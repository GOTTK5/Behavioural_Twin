const crypto = require('crypto');

// Only the hash is stored in the database.
function createOneTimeToken() {
  const token = crypto.randomBytes(32).toString('hex');
  return { token, hash: hashToken(token) };
}

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

module.exports = { createOneTimeToken, hashToken };
