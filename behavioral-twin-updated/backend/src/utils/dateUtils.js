// Returns today's date as YYYY-MM-DD in the configured local timezone (IST by default),
// instead of UTC. new Date().toISOString() always reflects UTC, which causes the date
// to appear to "lag behind" by several hours for any timezone ahead of UTC — e.g. it stays
// on the previous day until well into the morning in India (IST = UTC+5:30).
function getLocalDateString(date = new Date(), timezoneOffsetMinutes = 330) {
  // 330 minutes = +5:30 (IST). Pass a different offset if supporting other timezones later.
  const local = new Date(date.getTime() + timezoneOffsetMinutes * 60000);
  return local.toISOString().split('T')[0];
}

module.exports = { getLocalDateString };