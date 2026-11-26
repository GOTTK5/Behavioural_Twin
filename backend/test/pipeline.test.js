// End-to-end story test of the analysis pipeline: 6 weeks of one user's life,
// run through the real daily → weekly → patterns → episodes → AI-context code.
const test = require('node:test');
const assert = require('node:assert/strict');

delete process.env.GEMINI_API_KEY; // memory embedding is skipped in this test
const { install } = require('./helpers/fakeModels');
const Inputs = require('../src/models/Inputs');
const Intel = require('../src/models/Intelligence');
const Memory = require('../src/models/Memory');
const stores = install({ ...Inputs, ...Intel, Memory });

const { generateDailySummary } = require('../src/modules/processing/dailySummary');
const { runWeeklyBatchForUser } = require('../src/modules/processing/weeklyBatch');
const { weeklyBatchDue } = require('../src/jobs/scheduler');
const { buildContext } = require('../src/modules/conversation/contextEngine');
const { buildContextString } = require('../src/modules/conversation/llmCall');
const { addDays, getWeekRange, dateRange } = require('../src/utils/dateUtils');

const W = (n) => getWeekRange(addDays('2026-10-19', 7 * (n - 1))); // W1 starts Mon 2026-10-19

// ── the user's story ─────────────────────────────────────
async function logDay(userId, date, { sleep, mood, screen, steps = 7000, done = 3, total = 3 }) {
  await Inputs.Mood.create({ userId, date, score: mood, text: '' });
  await Inputs.HealthLog.create({ userId, date, sleepHours: sleep, steps, exerciseMinutes: 20, screenTimeHours: screen });
  for (let t = 0; t < total; t++) await Inputs.Task.create({ userId, date, title: `t${t}`, done: t < done });
  await generateDailySummary(userId, date);
}
async function gad7(userId, date, total) {
  const level = total <= 4 ? 'minimal' : total <= 9 ? 'mild' : total <= 14 ? 'moderate' : 'severe';
  await Inputs.PsychTest.create({ userId, date, weekYear: getWeekRange(date).weekYear, totalScore: total, anxietyLevel: level, answers: [] });
  for (let i = 0; i < 7; i++) await generateDailySummary(userId, addDays(date, i));
}
const normalDay = (i) => {
  const sleep = 6 + (i % 3);                       // 6,7,8
  return { sleep, mood: sleep - 1 + (i % 2), screen: 9 - sleep, done: 2 + (i % 2) };
};

const userA = { _id: 'user-a', timezone: 'Asia/Kolkata' };

test.before(async () => {
  let i = 0;
  for (const date of dateRange(W(1).startDate, W(5).endDate)) {
    i++;
    if (date >= '2026-11-02' && date <= '2026-11-06') {        // W3 Mon–Fri: bad stretch
      await logDay(userA._id, date, { sleep: 4, mood: 2, screen: 7, done: 0 });
    } else if (date >= '2026-11-11' && date <= '2026-11-13') { // W4 Wed–Fri: logged nothing
      continue;
    } else if (date >= '2026-11-20' && date <= '2026-11-22') { // W5 Fri–Sun: short sleep, mood ok
      await logDay(userA._id, date, { sleep: 4.5, mood: 5, screen: 6 });
    } else {
      await logDay(userA._id, date, normalDay(i));
    }
  }
  for (let w = 1; w <= 5; w++) await gad7(userA._id, W(w).endDate, w === 3 ? 15 : 3); // Sunday tests; W3 severe
});

const episodes = (userId, type) => stores.Episode.rows.filter(e => e.userId === userId && (!type || e.episodeType === type));

test('daily summaries: signals and anxiety carry-forward', () => {
  const day = stores.DailySummary.rows.find(d => d.date === '2026-11-03');
  assert.deepEqual([...day.signals].sort(), ['high_screen_time', 'low_mood', 'low_productivity', 'low_sleep', 'exercised'].sort());
  assert.equal(day.metrics.taskCompletionRate, 0);
  // W3 Sunday severe test applies to the next 6 days that have data
  assert.equal(stores.DailySummary.rows.find(d => d.date === '2026-11-10').metrics.anxietyScore, 15);
  assert.ok(stores.DailySummary.rows.find(d => d.date === '2026-11-10').signals.includes('high_anxiety'));
  assert.equal(stores.DailySummary.rows.find(d => d.date === '2026-11-16').metrics.anxietyScore, 3); // next test replaces it
  assert.equal(stores.DailySummary.rows.some(d => d.date === '2026-11-12'), false); // no data → no summary
});

test('weekly runs W1–W5: averages, week-over-week change, episodes', async () => {
  for (let w = 1; w <= 5; w++) await runWeeklyBatchForUser(userA, W(w));

  const w1 = stores.WeeklySummary.rows.find(r => r.weekYear === W(1).weekYear);
  const w1Days = stores.DailySummary.rows.filter(d => d.date >= W(1).startDate && d.date <= W(1).endDate);
  const expectMood = +(w1Days.reduce((a, d) => a + d.metrics.moodScore, 0) / w1Days.length).toFixed(2);
  assert.equal(w1.averages.mood, expectMood);
  assert.equal(w1Days.length, 7);

  const w3 = stores.WeeklySummary.rows.find(r => r.weekYear === W(3).weekYear);
  const w2 = stores.WeeklySummary.rows.find(r => r.weekYear === W(2).weekYear);
  assert.equal(w3.changes.mood, +(((w3.averages.mood - w2.averages.mood) / w2.averages.mood) * 100).toFixed(1));
  assert.ok(w3.changes.mood < 0, 'bad week shows a mood drop');
  assert.ok(w3.dominantSignals.includes('low_mood'));

  // W3 bad stretch → 4 finished episodes, each recorded once despite 3 later re-scans
  for (const [type, severity] of [['low_mood_streak', 'moderate'], ['sleep_deprivation', 'moderate'], ['productivity_crash', 'moderate'], ['burnout', 'severe']]) {
    const eps = episodes(userA._id, type).filter(e => e.startDate === '2026-11-02');
    assert.equal(eps.length, 1, `${type} recorded once`);
    assert.equal(eps[0].endDate, '2026-11-06');
    assert.equal(eps[0].severity, severity, `${type} severity`);
    assert.equal(eps[0].resolved, true);
  }

  // Anxiety period: Sun 11-08 → Tue 11-10, broken by the missing days
  const anx = episodes(userA._id, 'high_anxiety_period');
  assert.equal(anx.length, 1);
  assert.deepEqual([anx[0].startDate, anx[0].endDate, anx[0].resolved], ['2026-11-08', '2026-11-10', true]);

  // W5 Fri–Sun short sleep reaches the end of the week → still ongoing
  const sleepW5 = episodes(userA._id, 'sleep_deprivation').find(e => e.startDate === '2026-11-20');
  assert.deepEqual([sleepW5.endDate, sleepW5.severity, sleepW5.resolved], ['2026-11-22', 'mild', false]);
  assert.equal(episodes(userA._id, 'low_mood_streak').length, 1, 'mood 5 in W5 is not a low-mood streak');
});

test('patterns: real links found with the right direction; anxiety never over-confident', () => {
  const p = (a, b) => stores.BehavioralKnowledge.rows.find(r => r.userId === userA._id && r.sourceA === a && r.sourceB === b);
  const sleepMood = p('sleepHours', 'moodScore');
  assert.ok(sleepMood && sleepMood.correlation > 0.7, 'sleep ↔ mood strongly positive');
  assert.equal(sleepMood.confidence, 'high');
  assert.match(sleepMood.pattern, /Higher sleep is associated with higher mood/);
  assert.ok(sleepMood.observedWeeks >= 2);

  const screenSleep = p('screenTimeHours', 'sleepHours');
  assert.ok(screenSleep.correlation < 0);
  assert.match(screenSleep.pattern, /lower sleep/);

  for (const r of stores.BehavioralKnowledge.rows.filter(x => x.sourceA === 'anxietyScore')) {
    assert.equal(r.confidence, 'low');
  }
});

test('scheduler: due week, stale re-run, and no endless loop on an emptied week', async () => {
  const mondayMorning = new Date('2026-11-23T04:30:00Z'); // Mon 10:00 IST
  assert.equal(await weeklyBatchDue(userA, mondayMorning), null, 'W5 already processed');

  // Editing a day in W3 marks it stale → it is picked up next
  await Intel.WeeklySummary.updateOne({ userId: userA._id, weekYear: W(3).weekYear }, { stale: true });
  const due = await weeklyBatchDue(userA, mondayMorning);
  assert.equal(due.weekYear, W(3).weekYear);
  await runWeeklyBatchForUser(userA, due);
  assert.equal(await weeklyBatchDue(userA, mondayMorning), null);

  // Re-running old W3 must not re-open, shrink or duplicate anything
  const burnout = episodes(userA._id, 'burnout');
  assert.equal(burnout.length, 1);
  assert.equal(burnout[0].severity, 'severe');
  assert.equal(episodes(userA._id, 'sleep_deprivation').find(e => e.startDate === '2026-11-20').resolved, false, 'W5 episode untouched');

  // Delete everything in W4, mark it stale → summary removed, not retried forever
  for (const s of ['Mood', 'HealthLog', 'Task', 'PsychTest']) {
    stores[s].rows.splice(0, stores[s].rows.length, ...stores[s].rows.filter(r => !(r.date >= W(4).startDate && r.date <= W(4).endDate)));
  }
  for (const d of dateRange(W(4).startDate, W(4).endDate)) await generateDailySummary(userA._id, d);
  await Intel.WeeklySummary.updateOne({ userId: userA._id, weekYear: W(4).weekYear }, { stale: true });
  await runWeeklyBatchForUser(userA, await weeklyBatchDue(userA, mondayMorning));
  assert.equal(stores.WeeklySummary.rows.some(r => r.weekYear === W(4).weekYear), false);
  assert.equal(await weeklyBatchDue(userA, mondayMorning), null, 'nothing left to do');
});

test('episodes: continuing streak extends; re-running an older week does not re-open it', async () => {
  const userB = { _id: 'user-b', timezone: 'Asia/Kolkata' };
  for (const d of dateRange('2026-11-16', '2026-11-19')) await logDay(userB._id, d, { sleep: 7, mood: 6, screen: 2 });
  for (const d of dateRange('2026-11-20', '2026-11-24')) await logDay(userB._id, d, { sleep: 4, mood: 6, screen: 2 }); // Fri → Tue
  await logDay(userB._id, '2026-11-25', { sleep: 7, mood: 6, screen: 2 });

  await runWeeklyBatchForUser(userB, W(5));
  assert.equal(episodes(userB._id, 'sleep_deprivation')[0].resolved, false);
  await runWeeklyBatchForUser(userB, W(6));
  let ep = episodes(userB._id, 'sleep_deprivation');
  assert.equal(ep.length, 1);
  assert.deepEqual([ep[0].startDate, ep[0].endDate, ep[0].severity, ep[0].resolved], ['2026-11-20', '2026-11-24', 'moderate', true]);

  await runWeeklyBatchForUser(userB, W(5)); // stale re-run of the older week
  ep = episodes(userB._id, 'sleep_deprivation');
  assert.deepEqual([ep[0].endDate, ep[0].severity, ep[0].resolved], ['2026-11-24', 'moderate', true], 'not shrunk or re-opened');
});

test('episodes: an ongoing streak is closed when the user stops logging', async () => {
  const userC = { _id: 'user-c', timezone: 'Asia/Kolkata' };
  for (const d of dateRange('2026-11-19', '2026-11-22')) await logDay(userC._id, d, { sleep: 7, mood: 2, screen: 2 });
  await runWeeklyBatchForUser(userC, W(5));
  assert.equal(episodes(userC._id, 'low_mood_streak')[0].resolved, false);
  await runWeeklyBatchForUser(userC, W(6)); // nothing logged in W6
  assert.equal(episodes(userC._id, 'low_mood_streak')[0].resolved, true);
});

test('Twin context: honest about missing today, includes real patterns and episodes', async () => {
  const ctx = await buildContext({ ...userA, name: 'Asha' }, 'why am I tired?', '2026-11-24');
  const text = buildContextString(ctx);
  assert.match(text, /DATA GAP: nothing is logged for today yet\. The most recent logged day is 2026-11-22/);
  assert.match(text, /Higher sleep is associated with higher mood/);
  assert.match(text, /Sleep deprivation period since 2026-11-20 \(mild\)/);
  assert.match(text, /2026-11-22: Mood: 5\/9/);
  assert.ok(!/Anxiety.*high confidence/.test(text));
});
