// Central place for configuration. Fails fast at startup when a required
// variable is missing, instead of crashing later inside a request.

const REQUIRED = ['MONGO_URI', 'JWT_SECRET'];

function loadConfig() {
  const missing = REQUIRED.filter(k => !process.env[k]);
  if (missing.length) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}. See .env.example.`);
  }
  if (process.env.NODE_ENV === 'production' && process.env.JWT_SECRET.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters in production.');
  }
  if (!process.env.BREVO_API_KEY || !process.env.EMAIL_FROM) {
    console.warn('[config] BREVO_API_KEY / EMAIL_FROM not set — password reset emails are disabled' +
      (process.env.NODE_ENV === 'production' ? '.' : ' (reset links are printed in this console instead).'));
  }
  if (!process.env.GEMINI_API_KEY) {
    console.warn('[config] GEMINI_API_KEY is not set — Twin chat and semantic memory are disabled.');
  }
}

const config = {
  get isProduction()   { return process.env.NODE_ENV === 'production'; },
  get port()           { return Number(process.env.PORT) || 5000; },
  get mongoUri()       { return process.env.MONGO_URI; },
  get jwtSecret()      { return process.env.JWT_SECRET; },
  get jwtExpiresIn()   { return process.env.JWT_EXPIRES_IN || '7d'; },
  get frontendUrl()    { return process.env.FRONTEND_URL || ''; },
  get backendUrl()     { return process.env.BACKEND_URL || `http://localhost:${Number(process.env.PORT) || 5000}`; },
  get defaultTimezone(){ return process.env.DEFAULT_TIMEZONE || 'Asia/Kolkata'; },
  get enableCron()     { return process.env.ENABLE_CRON !== 'false'; },
  // Public URL of the website, used in emailed links. Render sets RENDER_EXTERNAL_URL itself.
  get appUrl() {
    const url = process.env.APP_URL || process.env.RENDER_EXTERNAL_URL || process.env.FRONTEND_URL || 'http://localhost:3000';
    return url.split(',')[0].trim().replace(/\/+$/, '');
  },

  email: {
    get brevoApiKey() { return process.env.BREVO_API_KEY || ''; },
    get from()        { return process.env.EMAIL_FROM || ''; },
    get fromName()    { return process.env.EMAIL_FROM_NAME || 'Twin'; },
    get enabled()     { return Boolean(this.brevoApiKey && this.from); }
  },

  gemini: {
    get apiKey()         { return process.env.GEMINI_API_KEY || ''; },
    get chatModel()      { return process.env.GEMINI_MODEL || 'gemini-flash-latest'; },
    get embeddingModel() { return process.env.GEMINI_EMBEDDING_MODEL || 'gemini-embedding-001'; }
  },

  google: {
    get clientId()     { return process.env.GOOGLE_CLIENT_ID || ''; },
    get clientSecret() { return process.env.GOOGLE_CLIENT_SECRET || ''; },
    get redirectUri()  {
      return process.env.GOOGLE_REDIRECT_URI || `${config.backendUrl}/api/google/callback`;
    },
    get enabled()      { return Boolean(this.clientId && this.clientSecret); }
  }
};

module.exports = { loadConfig, config };
