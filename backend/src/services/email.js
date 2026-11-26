// Brevo HTTPS API (Render's free tier blocks SMTP).

const { config } = require('../config/env');

const BREVO_URL = 'https://api.brevo.com/v3/smtp/email';

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function sendEmail({ to, toName, subject, text, html }) {
  if (!config.email.enabled) {
    if (!config.isProduction) {
      console.log(`\n[email:dev] To: ${to}\nSubject: ${subject}\n\n${text}\n`);
      return { delivered: false, dev: true };
    }
    console.error('[email] not configured — set BREVO_API_KEY and EMAIL_FROM');
    return { delivered: false };
  }

  const res = await fetch(BREVO_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', accept: 'application/json', 'api-key': config.email.brevoApiKey },
    body: JSON.stringify({
      sender: { name: config.email.fromName, email: config.email.from },
      to: [{ email: to, ...(toName && { name: toName }) }],
      subject,
      textContent: text,
      htmlContent: html
    }),
    signal: AbortSignal.timeout(15000)
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Brevo ${res.status}: ${body.slice(0, 200)}`);
  }
  return { delivered: true };
}

function passwordResetEmail({ name, link, minutes }) {
  const text = [
    `Hi ${name},`,
    '',
    'Someone (hopefully you) asked to reset the password for your Twin account.',
    `Open this link within ${minutes} minutes to choose a new password:`,
    '',
    link,
    '',
    "If you didn't ask for this, you can ignore this email — your password stays the same."
  ].join('\n');

  const html = `
<div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1a1d27">
  <h2 style="color:#6c63ff;margin:0 0 16px">Twin</h2>
  <p>Hi ${escapeHtml(name)},</p>
  <p>Someone (hopefully you) asked to reset the password for your Twin account.</p>
  <p style="margin:24px 0">
    <a href="${escapeHtml(link)}" style="background:#6c63ff;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold">Choose a new password</a>
  </p>
  <p style="font-size:13px;color:#555">This link works once and expires in ${minutes} minutes.<br>
  If the button doesn't work, copy this address into your browser:<br>
  <span style="word-break:break-all">${escapeHtml(link)}</span></p>
  <p style="font-size:13px;color:#555">If you didn't ask for this, ignore this email — your password stays the same.</p>
</div>`;

  return { subject: 'Reset your Twin password', text, html };
}

module.exports = { sendEmail, passwordResetEmail };
