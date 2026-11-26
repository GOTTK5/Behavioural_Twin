// Dates are "YYYY-MM-DD" strings in the user's timezone.

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86400000;

function isValidTimezone(tz) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function isValidDateString(str) {
  if (typeof str !== 'string' || !DATE_RE.test(str)) return false;
  const d = new Date(`${str}T00:00:00Z`);
  return !isNaN(d) && d.toISOString().slice(0, 10) === str;
}

function getLocalDateString(timezone = 'Asia/Kolkata', instant = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(instant);
}

function getLocalHour(timezone = 'Asia/Kolkata', instant = new Date()) {
  const h = new Intl.DateTimeFormat('en-US', { timeZone: timezone, hour: 'numeric', hourCycle: 'h23' }).format(instant);
  return Number(h);
}

function addDays(dateStr, n) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// 0 = Monday ... 6 = Sunday
function weekdayIndex(dateStr) {
  return (new Date(`${dateStr}T00:00:00Z`).getUTCDay() + 6) % 7;
}

// ISO-8601 week, e.g. "2026-W07"
function getWeekYear(dateStr) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  const thursday = new Date(d);
  thursday.setUTCDate(d.getUTCDate() + 3 - weekdayIndex(dateStr));
  const isoYear = thursday.getUTCFullYear();
  const jan4 = new Date(Date.UTC(isoYear, 0, 4));
  const week = 1 + Math.round(((thursday - jan4) / DAY_MS - 3 + ((jan4.getUTCDay() + 6) % 7)) / 7);
  return `${isoYear}-W${String(week).padStart(2, '0')}`;
}

function getWeekRange(dateStr) {
  const startDate = addDays(dateStr, -weekdayIndex(dateStr));
  const endDate = addDays(startDate, 6);
  return { startDate, endDate, weekYear: getWeekYear(startDate) };
}

function getLastCompletedWeekRange(timezone = 'Asia/Kolkata', instant = new Date()) {
  const today = getLocalDateString(timezone, instant);
  const thisMonday = addDays(today, -weekdayIndex(today));
  return getWeekRange(addDays(thisMonday, -7));
}

function dateRange(startDate, endDate) {
  const out = [];
  for (let d = startDate; d <= endDate; d = addDays(d, 1)) out.push(d);
  return out;
}

// UTC epoch ms of local midnight at the start of dateStr in `timezone`.
function zonedMidnightMs(dateStr, timezone) {
  const guess = Date.parse(`${dateStr}T00:00:00Z`);
  const offsetAt = (ms) => {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone, hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit'
    }).formatToParts(new Date(ms)).reduce((a, p) => (a[p.type] = p.value, a), {});
    const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
    return asUtc - ms;
  };
  let ms = guess - offsetAt(guess);
  ms = guess - offsetAt(ms); // DST
  return ms;
}

module.exports = {
  isValidTimezone,
  isValidDateString,
  getLocalDateString,
  getLocalHour,
  addDays,
  weekdayIndex,
  getWeekYear,
  getWeekRange,
  getLastCompletedWeekRange,
  dateRange,
  zonedMidnightMs
};
