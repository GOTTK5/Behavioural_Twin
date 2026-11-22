const { DailySummary, Episode } = require('../../models/Intelligence');

const EPISODE_RULES = [
  {
    type: 'low_mood_streak',
    label: 'Low mood streak',
    check: (signals) => signals.includes('low_mood'), // this func takes signals array as parameter and return true/false based on query.
    threshold: 4, // days
    severity: (count) => count >= 7 ? 'severe' : count >= 5 ? 'moderate' : 'mild' // this func takes count as parameter and returns string.
  },
  {
    type: 'sleep_deprivation',
    label: 'Sleep deprivation period',
    check: (signals) => signals.includes('low_sleep'),
    threshold: 3,
    severity: (count) => count >= 6 ? 'severe' : count >= 4 ? 'moderate' : 'mild'
  },
  {
    type: 'productivity_crash',
    label: 'Productivity crash',
    check: (signals) => signals.includes('low_productivity'),
    threshold: 4,
    severity: (count) => count >= 7 ? 'severe' : count >= 5 ? 'moderate' : 'mild'
  },
  {
    type: 'burnout',
    label: 'Potential burnout',
    // Burnout = low mood + low productivity + low sleep together
    check: (signals) => signals.includes('low_mood') && signals.includes('low_productivity'),
    threshold: 3,
    severity: () => 'severe'
  },
  {
    type: 'high_anxiety_period',
    label: 'Elevated anxiety period',
    check: (signals) => signals.includes('high_anxiety'),
    threshold: 2,
    severity: (count) => count >= 4 ? 'severe' : 'moderate'
  }
];

async function runEpisodeDetector(userId, startDate, endDate) {
  const summaries = await DailySummary.find({ // it accesses dates from scheduler.js, here DailySummary being model of summaries fetches the daily summaries of that week 
    userId,
    date: { $gte: startDate, $lte: endDate }
  }).sort({ date: 1 }); // oldest one first, so that we can detect streaks in order.

  const detectedEpisodes = [];

  for (const rule of EPISODE_RULES) { // scan separately for each rule 
    let streak = 0;
    let streakStart = null;
    let prevSummary = null;

    for (const summary of summaries) { // begin with day one of the week and check 
    
      if (rule.check(summary.signals)) { // here it access the signals array of the summary section of that particular day and checks if any signal matches 
        streak++;
        if (streak === 1) streakStart = summary.date; // if its first day of the signal add start date
          
        summary.signals.forEach(s => {  // collecting unique signals that triggered the episode during the streak
          if (!streakSignals.includes(s)) streakSignals.push(s);
        });
        prevSummary = summary; // store the previous summary for end date reference 
      } 
      else {      // if the signal is not present, check if the streak is enough to be considered an episode
        if (streak >= rule.threshold) {
          detectedEpisodes.push({
            type: rule.type,
            label: rule.label,
            startDate: streakStart,
            endDate: prevSummary.date,
            severity: rule.severity(streak),// calls the severity func in rule with streak as parameter 
            triggers: streakSignals,
            resolved: true// mark as resolved since it ended before the week ended
          });
        }
        streak = 0; // reset streak and start date for next potential episode
        streakStart = null; 
        streakSignals = [];
        prevSummary = null;
      }
    }

    // Edge case: if the streak continues till the last day of the week then else part of the for loop won't be executed
    if (streak >= rule.threshold) {
      detectedEpisodes.push({
        type: rule.type,
        label: rule.label,
        startDate: streakStart,
        endDate: summaries[summaries.length - 1]?.date,
        severity: rule.severity(streak),
        triggers: streakSignals,
        resolved: false // mark as unresolved since it continues beyond the week
      });
    }
  }

  // Save new episodes (avoid duplicates)
  for (const ep of detectedEpisodes) {
    const exists = await Episode.findOne({
      userId,
      episodeType: ep.type,
      startDate: ep.startDate
    });

    if (!exists) {
      await Episode.create({ userId, episodeType: ep.type, ...ep });
    }
  }

  return detectedEpisodes;
}

module.exports = { runEpisodeDetector };
