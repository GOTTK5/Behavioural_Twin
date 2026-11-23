const mongoose = require('mongoose');
const { config } = require('./env');

const RETRY_MS = 15000;

// Turns MongoDB's long error messages into a short, actionable hint.
function explain(err) {
  const msg = err?.message || String(err);
  if (/authentication failed|bad auth/i.test(msg)) {
    return 'Wrong database username or password in MONGO_URI (check Atlas → Database Access, and that <db_password> was replaced).';
  }
  if (/whitelist|IP that isn't|Could not connect to any servers/i.test(msg)) {
    return 'Atlas is blocking this server. Add 0.0.0.0/0 in Atlas → Network Access and wait until it shows Active.';
  }
  if (/ENOTFOUND|querySrv|EBADNAME/i.test(msg)) {
    return 'The cluster address in MONGO_URI is wrong (copy it again from Atlas → Connect → Drivers).';
  }
  if (/Invalid scheme|mongodb\+srv|URI/i.test(msg)) {
    return 'MONGO_URI is not a valid connection string (it must start with mongodb+srv:// or mongodb://).';
  }
  return msg;
}

// TEMPORARY deploy diagnostics: what the server actually received in MONGO_URI,
// without ever revealing the password. Shown on /api/health only while disconnected.
function describeUri(raw) {
  const uri = raw || '';
  const m = uri.trim().match(/^(mongodb(?:\+srv)?):\/\/([^:@/]*)(?::([^@]*))?@([^/?]+)(\/[^?]*)?(\?.*)?$/);
  if (!m) return { parsed: false, startsWith: uri.slice(0, 14), length: uri.length };
  const [, scheme, user, password = '', host, path = '', query = ''] = m;
  return {
    scheme,
    user,
    host,
    database: path.replace('/', '') || '(none → "test")',
    hasOptions: Boolean(query),
    passwordLength: password.length,
    passwordHasAngleBrackets: /[<>]/.test(password),
    passwordHasSpecialChars: /[^A-Za-z0-9]/.test(password),
    valueHasOuterSpaces: uri !== uri.trim(),
    valueHasQuotes: /^["']|["']$/.test(uri.trim())
  };
}

let lastError = null;
const getDbError = () => lastError;
const getUriDiagnostics = () => describeUri(config.mongoUri);

// Connects in the background and keeps retrying, so the web server stays up
// and /api/health can report what is wrong instead of the app crashing.
function connectMongo(onConnected) {
  const attempt = async () => {
    try {
      await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 10000 });
      lastError = null;
      console.log('MongoDB connected');
      onConnected?.();
    } catch (err) {
      lastError = explain(err);
      console.error(`MongoDB connection failed: ${lastError} Retrying in ${RETRY_MS / 1000}s...`);
      setTimeout(attempt, RETRY_MS);
    }
  };
  attempt();
}

module.exports = { connectMongo, getDbError, getUriDiagnostics };
