
class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

// Express 4 doesn't forward async errors on its own.
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// undefined = not sent, null = cleared
function optionalNumber(value, field, { min = -Infinity, max = Infinity, integer = false } = {}) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max || (integer && !Number.isInteger(n))) {
    throw new HttpError(400, `${field} must be ${integer ? 'a whole number' : 'a number'} between ${min} and ${max}`);
  }
  return n;
}

function requiredString(value, field, { max = 10000, min = 1 } = {}) {
  if (typeof value !== 'string' || value.trim().length < min) {
    throw new HttpError(400, `${field} is required`);
  }
  if (value.length > max) throw new HttpError(400, `${field} must be at most ${max} characters`);
  return value.trim();
}

function optionalString(value, field, { max = 10000 } = {}) {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') throw new HttpError(400, `${field} must be text`);
  if (value.length > max) throw new HttpError(400, `${field} must be at most ${max} characters`);
  return value.trim();
}

function clampInt(value, fallback, min, max) {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

module.exports = { HttpError, asyncHandler, optionalNumber, requiredString, optionalString, clampInt };
