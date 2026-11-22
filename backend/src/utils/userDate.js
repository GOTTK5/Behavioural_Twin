const { config } = require('../config/env');
const { getLocalDateString, isValidDateString } = require('./dateUtils');
const { HttpError } = require('./http');

function userTimezone(user) {
  return user?.timezone || config.defaultTimezone;
}

function userToday(user) {
  return getLocalDateString(userTimezone(user));
}

// Validates a client-supplied date; defaults to the user's "today".
// Future dates are rejected so nobody can log tomorrow's mood.
function resolveDate(user, date) {
  const today = userToday(user);
  if (date === undefined || date === null || date === '') return today;
  if (!isValidDateString(date)) throw new HttpError(400, 'date must be in YYYY-MM-DD format');
  if (date > today) throw new HttpError(400, 'date cannot be in the future');
  return date;
}

module.exports = { userTimezone, userToday, resolveDate };
