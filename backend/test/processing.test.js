const test = require('node:test');
const assert = require('node:assert/strict');
const { detectEpisodes } = require('../src/modules/processing/episodeDetector');
const { computeCorrelations, describePattern } = require('../src/modules/processing/correlation');
const { buildSignals } = require('../src/modules/processing/dailySummary');
const { cosineSimilarity } = require('../src/modules/memory/vectorStore');
const { getTrendLine } = require('../src/modules/conversation/contextEngine');
const { addDays } = require('../src/utils/dateUtils');

const day = (date, signals, metrics = {}) => ({ date, signals, metrics });

test('detects an ongoing low-mood streak even when it starts on day one', () => {
  const s = ['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04'].map(dt => day(dt, ['low_mood']));
  const eps = detectEpisodes(s, '2026-11-04');
  const ep = eps.find(e => e.episodeType === 'low_mood_streak');
  assert.ok(ep);
  assert.equal(ep.startDate, '2026-11-01');
  assert.equal(ep.resolved, false);
  assert.deepEqual(ep.triggers, ['low_mood']);
});

test('a missing day breaks a streak', () => {
  const s = ['2026-11-01', '2026-11-02', '2026-11-04', '2026-11-05'].map(dt => day(dt, ['low_mood']));
  assert.equal(detectEpisodes(s, '2026-11-05').filter(e => e.episodeType === 'low_mood_streak').length, 0);
});

test('ended streak is resolved, signals do not leak between rules', () => {
  const s = [
    day('2026-11-01', ['low_sleep']), day('2026-11-02', ['low_sleep']), day('2026-11-03', ['low_sleep', 'high_mood']),
    day('2026-11-04', ['good_sleep'])
  ];
  const eps = detectEpisodes(s, '2026-11-04');
  assert.equal(eps.length, 1);
  assert.equal(eps[0].episodeType, 'sleep_deprivation');
  assert.equal(eps[0].resolved, true);
  assert.equal(eps[0].endDate, '2026-11-03');
});

test('correlation finds a strong sleep→mood link and wording matches sign', () => {
  const summaries = Array.from({ length: 14 }, (_, i) => ({
    date: addDays('2026-11-01', i),
    metrics: { sleepHours: 4 + (i % 5), moodScore: 2 + (i % 5), screenTimeHours: 8 - (i % 5) }
  }));
  const results = computeCorrelations(summaries);
  const sleepMood = results.find(r => r.metricA === 'sleepHours' && r.metricB === 'moodScore');
  assert.ok(sleepMood);
  assert.equal(sleepMood.confidence, 'high');
  assert.match(sleepMood.pattern, /^Higher sleep is associated with higher mood/);
  const screenSleep = results.find(r => r.metricA === 'screenTimeHours' && r.metricB === 'sleepHours');
  assert.match(screenSleep.pattern, /lower sleep/);
  assert.equal(describePattern('a and b', -0.5), 'Higher a is associated with lower b (r=-0.50)');
});

test('correlation needs enough data points', () => {
  const few = Array.from({ length: 5 }, (_, i) => ({ metrics: { sleepHours: i, moodScore: i } }));
  assert.deepEqual(computeCorrelations(few), []);
});

test('signals treat 0 as a real value', () => {
  assert.deepEqual(buildSignals({ healthLog: { sleepHours: 0 } }), ['low_sleep']);
  assert.deepEqual(buildSignals({ mood: { score: 8 }, taskCompletionRate: 0, anxietyLevel: 'severe' }), ['high_mood', 'low_productivity', 'high_anxiety']);
});

test('cosine similarity', () => {
  assert.equal(cosineSimilarity([1, 0], [1, 0]), 1);
  assert.equal(cosineSimilarity([1, 0], [0, 1]), 0);
  assert.equal(cosineSimilarity([0, 0], [1, 1]), 0);
});

test('trend direction (newest first); screen time lower is better', () => {
  const dailies = [9, 8, 8, 3, 2, 2].map(v => ({ metrics: { moodScore: v, screenTimeHours: v } }));
  assert.match(getTrendLine(dailies, 'moodScore', 1, 'Mood'), /rising \(improving\)/);
  assert.match(getTrendLine(dailies, 'screenTimeHours', 1, 'Screen time', true), /rising \(declining\)/);
});
