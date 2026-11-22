const test = require('node:test');
const assert = require('node:assert/strict');
const d = require('../src/utils/dateUtils');

test('ISO week numbers', () => {
  assert.equal(d.getWeekYear('2026-01-01'), '2026-W01'); // Thursday
  assert.equal(d.getWeekYear('2025-12-29'), '2026-W01'); // Monday of W01
  assert.equal(d.getWeekYear('2027-01-03'), '2026-W53'); // Sunday belongs to previous ISO year
  assert.equal(d.getWeekYear('2026-06-22'), '2026-W26');
  assert.equal(d.getWeekYear('2026-06-28'), '2026-W26'); // same week Mon→Sun
});

test('week range is Monday to Sunday', () => {
  assert.deepEqual(d.getWeekRange('2026-11-25'), { startDate: '2026-11-23', endDate: '2026-11-29', weekYear: '2026-W48' });
  assert.deepEqual(d.getWeekRange('2026-11-29'), { startDate: '2026-11-23', endDate: '2026-11-29', weekYear: '2026-W48' });
});

test('last completed week never includes the current week', () => {
  const sunday = new Date('2026-11-22T12:00:00Z'); // Sunday in IST
  assert.equal(d.getLastCompletedWeekRange('Asia/Kolkata', sunday).endDate, '2026-11-15');
  const monday = new Date('2026-11-23T06:00:00Z');
  assert.equal(d.getLastCompletedWeekRange('Asia/Kolkata', monday).endDate, '2026-11-22');
});

test('local date respects timezone, not UTC', () => {
  const instant = new Date('2026-03-10T20:00:00Z'); // 01:30 next day in IST
  assert.equal(d.getLocalDateString('Asia/Kolkata', instant), '2026-03-11');
  assert.equal(d.getLocalDateString('America/New_York', instant), '2026-03-10');
  assert.equal(d.getLocalHour('Asia/Kolkata', instant), 1);
});

test('zoned midnight', () => {
  assert.equal(new Date(d.zonedMidnightMs('2026-03-11', 'Asia/Kolkata')).toISOString(), '2026-03-10T18:30:00.000Z');
  assert.equal(new Date(d.zonedMidnightMs('2026-07-01', 'America/New_York')).toISOString(), '2026-07-01T04:00:00.000Z');
});

test('date validation and arithmetic', () => {
  assert.ok(d.isValidDateString('2026-02-28'));
  assert.ok(!d.isValidDateString('2026-02-30'));
  assert.ok(!d.isValidDateString('26-2-3'));
  assert.equal(d.addDays('2026-12-31', 1), '2027-01-01');
  assert.deepEqual(d.dateRange('2026-01-30', '2026-02-01'), ['2026-01-30', '2026-01-31', '2026-02-01']);
  assert.ok(d.isValidTimezone('Europe/London'));
  assert.ok(!d.isValidTimezone('Mars/Base'));
});

test('Sunday is inside its week: before midnight the week is not processed yet, right after it is', () => {
  const sunNight = new Date('2026-11-22T18:25:00Z'); // Sun 23:55 IST
  const monEarly = new Date('2026-11-22T18:35:00Z'); // Mon 00:05 IST
  assert.equal(d.getLastCompletedWeekRange('Asia/Kolkata', sunNight).weekYear, '2026-W46');
  assert.deepEqual(d.getLastCompletedWeekRange('Asia/Kolkata', monEarly),
    { startDate: '2026-11-16', endDate: '2026-11-22', weekYear: '2026-W47' }); // ends on that Sunday
});
