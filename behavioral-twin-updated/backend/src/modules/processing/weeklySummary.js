const { DailySummary, WeeklySummary, BehavioralKnowledge, Episode } = require('../../models/Intelligence');
const { getCollection } = require('../../config/chroma');
const { v4: uuidv4 } = require('uuid');

async function generateWeeklySummary(userId, weekYear, startDate, endDate) {
  const dailies = await DailySummary.find({
    userId,
    date: { $gte: startDate, $lte: endDate }
  });

  if (dailies.length === 0) return null;

  // Compute averages
  const avg = (key) => {
    const vals = dailies.map(d => d.metrics[key]).filter(v => v != null);
    return vals.length ? parseFloat((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2)) : null;
  };

  const averages = {
    mood:               avg('moodScore'),
    sleepHours:         avg('sleepHours'),
    steps:              avg('steps'),
    exerciseMinutes:    avg('exerciseMinutes'),
    screenTimeHours:    avg('screenTimeHours'),
    taskCompletionRate: avg('taskCompletionRate'),
    anxietyScore:       avg('anxietyScore')
  };

  // Get previous week's averages for % change
  const prevWeekDoc = await WeeklySummary.findOne({ userId })
    .sort({ weekYear: -1 })
    .where('weekYear').ne(weekYear);

  const changes = {};
  if (prevWeekDoc) {
    const calcChange = (curr, prev) =>
      (curr != null && prev != null && prev !== 0)
        ? parseFloat(((curr - prev) / prev * 100).toFixed(1))
        : null;

    changes.mood        = calcChange(averages.mood,               prevWeekDoc.averages.mood);
    changes.sleep       = calcChange(averages.sleepHours,         prevWeekDoc.averages.sleepHours);
    changes.steps       = calcChange(averages.steps,              prevWeekDoc.averages.steps);
    changes.exercise    = calcChange(averages.exerciseMinutes,    prevWeekDoc.averages.exerciseMinutes);
    changes.screenTime  = calcChange(averages.screenTimeHours,    prevWeekDoc.averages.screenTimeHours);
    changes.productivity = calcChange(averages.taskCompletionRate, prevWeekDoc.averages.taskCompletionRate);
  }

  // Dominant signals — what appeared most this week
  const signalCounts = {};
  dailies.forEach(d => d.signals.forEach(s => { signalCounts[s] = (signalCounts[s] || 0) + 1; }));
  const dominantSignals = Object.entries(signalCounts)
    .filter(([, count]) => count >= 3)
    .sort((a, b) => b[1] - a[1])
    .map(([signal]) => signal);

  // Build summary text
  const lines = [`Week ${weekYear} summary.`];
  if (averages.mood)               lines.push(`Average mood: ${averages.mood}/9.`);
  if (averages.sleepHours)         lines.push(`Average sleep: ${averages.sleepHours}h.`);
  if (averages.steps)              lines.push(`Average steps: ${averages.steps}.`);
  if (averages.taskCompletionRate) lines.push(`Task completion: ${(averages.taskCompletionRate * 100).toFixed(0)}%.`);
  if (averages.anxietyScore)       lines.push(`Average anxiety score: ${averages.anxietyScore}/21.`);
  if (dominantSignals.length)      lines.push(`Recurring signals: ${dominantSignals.join(', ')}.`);
  if (changes.mood)                lines.push(`Mood changed ${changes.mood > 0 ? '+' : ''}${changes.mood}% vs last week.`);

  const summary = lines.join(' ');

  const doc = await WeeklySummary.findOneAndUpdate(
    { userId, weekYear },
    { startDate, endDate, summary, averages, changes, dominantSignals },
    { upsert: true, new: true }
  );

  // Embed in ChromaDB
  await embedWeeklyInChroma(userId, doc);

  return doc;
}

async function embedWeeklyInChroma(userId, weeklyDoc) {
  const collection = getCollection('weeklySummaries');
  if (!collection) return;

  try {
    const id = `${userId}_${weeklyDoc.weekYear}`;
    await collection.upsert({
      ids: [id],
      documents: [weeklyDoc.summary],
      metadatas: [{
        userId: userId.toString(),
        weekYear: weeklyDoc.weekYear,
        avgMood: weeklyDoc.averages.mood || 0,
        avgSleep: weeklyDoc.averages.sleepHours || 0
      }]
    });
    await WeeklySummary.findByIdAndUpdate(weeklyDoc._id, { chromaEmbedded: true });
  } catch (err) {
    console.error('Chroma weekly embed error:', err.message);
  }
}

async function embedKnowledgeInChroma(userId, knowledgeDoc) {
  const collection = getCollection('knowledgePatterns');
  if (!collection) return;

  try {
    const id = `${userId}_${knowledgeDoc.sourceA}_${knowledgeDoc.sourceB}`;
    await collection.upsert({
      ids: [id],
      documents: [knowledgeDoc.pattern],
      metadatas: [{
        userId: userId.toString(),
        sourceA: knowledgeDoc.sourceA,
        sourceB: knowledgeDoc.sourceB,
        confidence: knowledgeDoc.confidence,
        correlation: knowledgeDoc.correlation
      }]
    });
    await BehavioralKnowledge.findByIdAndUpdate(knowledgeDoc._id, { chromaEmbedded: true });
  } catch (err) {
    console.error('Chroma knowledge embed error:', err.message);
  }
}

async function embedEpisodeInChroma(userId, episodeDoc) {
  const collection = getCollection('episodes');
  if (!collection) return;

  try {
    const text = `${episodeDoc.label} from ${episodeDoc.startDate} to ${episodeDoc.endDate}. Severity: ${episodeDoc.severity}. Triggers: ${episodeDoc.triggers.join(', ')}.`;
    await collection.upsert({
      ids: [episodeDoc._id.toString()],
      documents: [text],
      metadatas: [{
        userId: userId.toString(),
        episodeType: episodeDoc.episodeType,
        startDate: episodeDoc.startDate,
        severity: episodeDoc.severity
      }]
    });
    await Episode.findByIdAndUpdate(episodeDoc._id, { chromaEmbedded: true });
  } catch (err) {
    console.error('Chroma episode embed error:', err.message);
  }
}

module.exports = {
  generateWeeklySummary,
  embedKnowledgeInChroma,
  embedEpisodeInChroma
};
