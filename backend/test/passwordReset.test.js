const test = require('node:test');
const assert = require('node:assert/strict');
const { createOneTimeToken, hashToken } = require('../src/utils/tokens');
const User = require('../src/models/User');

test('reset tokens are random, 64 hex chars, and only the hash is stored', () => {
  const a = createOneTimeToken();
  const b = createOneTimeToken();
  assert.match(a.token, /^[a-f0-9]{64}$/);
  assert.notEqual(a.token, b.token);
  assert.equal(a.hash, hashToken(a.token));
  assert.notEqual(a.hash, a.token);
});

test('sessions issued before a password change are rejected', () => {
  const user = new User({ name: 'x', email: 'x@y.z', password: 'whatever1' });
  const before = Math.floor(Date.now() / 1000) - 60;
  assert.equal(user.tokenIssuedBeforePasswordChange(before), false); // never changed
  user.passwordChangedAt = new Date();
  assert.equal(user.tokenIssuedBeforePasswordChange(before), true);
  assert.equal(user.tokenIssuedBeforePasswordChange(Math.floor(Date.now() / 1000)), false); // new token
});

test('reset tokens and expiry are never included in public user JSON', () => {
  const user = new User({ name: 'x', email: 'x@y.z', password: 'whatever1', passwordResetTokenHash: 'h', passwordResetExpires: new Date() });
  const json = JSON.stringify(user.toPublicJSON());
  assert.ok(!json.includes('passwordReset'));
  assert.ok(!json.includes('whatever1'));
});

test('email is sent through Brevo with the reset link', async () => {
  process.env.BREVO_API_KEY = 'test-brevo-key';
  process.env.EMAIL_FROM = 'twin@example.com';
  const { sendEmail, passwordResetEmail } = require('../src/services/email');
  let captured;
  global.fetch = async (url, opts) => { captured = { url, opts }; return { ok: true, json: async () => ({}) }; };

  const link = 'https://twin.example.com/reset-password?token=abc';
  const result = await sendEmail({ to: 'user@example.com', toName: 'Asha <b>', ...passwordResetEmail({ name: 'Asha <b>', link, minutes: 30 }) });

  assert.equal(result.delivered, true);
  assert.equal(captured.url, 'https://api.brevo.com/v3/smtp/email');
  assert.equal(captured.opts.headers['api-key'], 'test-brevo-key');
  const body = JSON.parse(captured.opts.body);
  assert.equal(body.to[0].email, 'user@example.com');
  assert.equal(body.sender.email, 'twin@example.com');
  assert.ok(body.textContent.includes(link));
  assert.ok(body.htmlContent.includes('Asha &lt;b&gt;'), 'name is HTML-escaped');
});
