// const TWIN_SYSTEM_PROMPT = `You are Twin — a personal behavioral AI assistant. You have deep knowledge of the user's behavioral patterns, mood history, sleep data, productivity, and psychological state over time.

// Your role is to:
// 1. Help the user understand their own behavior and patterns
// 2. Provide personalized, evidence-based psychological insights
// 3. Suggest practical interventions based on their specific data
// 4. Be honest, direct, and warm — not generic or preachy
// 5. Reference their actual data and patterns when responding

// You are NOT a therapist and NOT a medical professional. If you detect signs of serious mental health issues, gently suggest professional support.

// Always respond in a conversational, supportive tone. Keep responses concise unless depth is needed.`;

// async function callLLM(userMessage, contextPackage, conversationHistory = []) {
//   const contextStr = buildContextString(contextPackage);

//   const messages = [
//     { role: 'system', content: TWIN_SYSTEM_PROMPT },
//     ...conversationHistory,
//     {
//       role: 'user',
//       content: `[Behavioral Context]\n${contextStr}\n\n[User Message]\n${userMessage}`
//     }
//   ];

//   const response = await fetch('http://localhost:11434/api/chat', {
//     method: 'POST',
//     headers: { 'Content-Type': 'application/json' },
//     body: JSON.stringify({
//       model: 'llama3.2',
//       messages,
//       stream: false
//     })
//   });

//   if (!response.ok) {
//     throw new Error(`Ollama request failed: ${response.status} ${response.statusText}`);
//   }

//   const data = await response.json();
//   return data.message.content;
// }

// function buildContextString(ctx) {
//   const parts = [];

//   if (ctx.currentState)
//     parts.push(`Current state: ${ctx.currentState}`);

//   if (ctx.currentWeekSummary)
//     parts.push(`This week: ${ctx.currentWeekSummary}`);

//   if (ctx.behavioralPatterns?.length)
//     parts.push(`Known patterns about this user:\n${ctx.behavioralPatterns.map(p => `- ${p}`).join('\n')}`);

//   if (ctx.relevantPatternsFromQuery?.length)
//     parts.push(`Relevant patterns for this query:\n${ctx.relevantPatternsFromQuery.map(p => `- ${p}`).join('\n')}`);

//   if (ctx.similarPastWeeks?.length)
//     parts.push(`Similar past periods:\n${ctx.similarPastWeeks.map(w => `- ${w}`).join('\n')}`);

//   if (ctx.significantEpisodes?.length)
//     parts.push(`Relevant past episodes:\n${ctx.significantEpisodes.map(e => `- ${e}`).join('\n')}`);

//   if (ctx.dominantSignals?.length)
//     parts.push(`Dominant signals this week: ${ctx.dominantSignals.join(', ')}`);

//   return parts.join('\n\n') || 'No behavioral data available yet. Encourage user to start logging.';
// }

// module.exports = { callLLM };




// const TWIN_SYSTEM_PROMPT = `You are Twin — a personal behavioral AI assistant. You have deep knowledge of the user's behavioral patterns, mood history, sleep data, productivity, and psychological state over time.

// Your role is to:
// 1. Help the user understand their own behavior and patterns
// 2. Provide personalized, evidence-based psychological insights
// 3. Suggest practical interventions based on their specific data
// 4. Be honest, direct, and warm — not generic or preachy
// 5. Reference their actual data and patterns when responding

// You are NOT a therapist and NOT a medical professional. If you detect signs of serious mental health issues, gently suggest professional support.

// IMPORTANT — data honesty: The behavioral context you receive may be incomplete or from a previous period (e.g. today's data may not be logged yet, or the most recent weekly summary may be from a past week, not the current one). Never invent specific numbers, dates, or "last night's sleep" style details that are not explicitly present in the context provided. If today's data isn't available, say so plainly and ask the user to share it, rather than guessing or assuming the most recent record refers to "today" or "this week."

// Always respond in a conversational, supportive tone. Keep responses concise unless depth is needed.`;

// async function callLLM(userMessage, contextPackage, conversationHistory = []) {
//   const contextStr = buildContextString(contextPackage);

//   const messages = [
//     { role: 'system', content: TWIN_SYSTEM_PROMPT },
//     ...conversationHistory,
//     {
//       role: 'user',
//       content: `[Behavioral Context]\n${contextStr}\n\n[User Message]\n${userMessage}`
//     }
//   ];

//   const response = await fetch('http://localhost:11434/api/chat', {
//     method: 'POST',
//     headers: { 'Content-Type': 'application/json' },
//     body: JSON.stringify({
//       model: 'llama3.2',
//       messages,
//       stream: false
//     })
//   });

//   if (!response.ok) {
//     throw new Error(`Ollama request failed: ${response.status} ${response.statusText}`);
//   }

//   const data = await response.json();
//   return data.message.content;
// }

// function buildContextString(ctx) {
//   const parts = [];

//   if (ctx.today)
//     parts.push(`Today's date is ${ctx.today}.`);

//   if (ctx.currentState)
//     parts.push(`Current state: ${ctx.currentState}`);

//   if (ctx.currentWeekLabel)
//     parts.push(`Most recent completed week on record: ${ctx.currentWeekLabel}`);

//   if (ctx.currentWeekSummary)
//     parts.push(`That week's summary: ${ctx.currentWeekSummary}`);

//   if (ctx.behavioralPatterns?.length)
//     parts.push(`Known patterns about this user:\n${ctx.behavioralPatterns.map(p => `- ${p}`).join('\n')}`);

//   if (ctx.relevantPatternsFromQuery?.length)
//     parts.push(`Relevant patterns for this query:\n${ctx.relevantPatternsFromQuery.map(p => `- ${p}`).join('\n')}`);

//   if (ctx.similarPastWeeks?.length)
//     parts.push(`Similar past periods:\n${ctx.similarPastWeeks.map(w => `- ${w}`).join('\n')}`);

//   if (ctx.significantEpisodes?.length)
//     parts.push(`Relevant past episodes:\n${ctx.significantEpisodes.map(e => `- ${e}`).join('\n')}`);

//   if (ctx.dominantSignals?.length)
//     parts.push(`Dominant signals this week: ${ctx.dominantSignals.join(', ')}`);

//   return parts.join('\n\n') || 'No behavioral data available yet. Encourage user to start logging.';
// }

// module.exports = { callLLM };






const TWIN_SYSTEM_PROMPT = `You are Twin — a personal behavioral AI assistant. You have deep knowledge of the user's behavioral patterns, mood history, sleep data, productivity, and psychological state over time.

Your role is to:
1. Help the user understand their own behavior and patterns
2. Provide personalized, evidence-based psychological insights
3. Suggest practical interventions based on their specific data
4. Be honest, direct, and warm — not generic or preachy
5. Reference their actual data and patterns when responding

You are NOT a therapist and NOT a medical professional. If you detect signs of serious mental health issues, gently suggest professional support.

CRITICAL RULE: Only state facts, numbers, or dates that are explicitly written in the context below. Never say "last night," "today," or "yesterday" with a specific number unless that exact date and number appear in the context. If you see a "DATA GAP WARNING" in the context, you must mention that today's data is missing before answering anything else.

Always respond in a conversational, supportive tone. Keep responses concise unless depth is needed.`;

async function callLLM(userMessage, contextPackage, conversationHistory = []) {
  const contextStr = buildContextString(contextPackage);

  const messages = [
    { role: 'system', content: TWIN_SYSTEM_PROMPT },
    ...conversationHistory,
    {
      role: 'user',
      content: `[Behavioral Context]\n${contextStr}\n\n[User Message]\n${userMessage}`
    }
  ];

  const response = await fetch('http://localhost:11434/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'llama3.2',
      messages,
      stream: false
    })
  });

  if (!response.ok) {
    throw new Error(`Ollama request failed: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return data.message.content;
}

function buildContextString(ctx) {
  const parts = [];

  // Small local models (like llama3.2) don't reliably follow soft system-prompt
  // instructions about missing data — so we put a hard, unmissable warning line
  // directly in the context itself when today's data isn't logged yet.
  if (ctx.currentState?.includes('No summary exists yet for today')) {
    parts.push(`⚠️ DATA GAP WARNING: Today's behavioral data has NOT been logged yet. Do not reference "today," "last night," or any specific number as if it happened today. Only discuss data from the dates explicitly listed below.`);
  }

  if (ctx.today)
    parts.push(`Today's date is ${ctx.today}.`);

  if (ctx.currentState)
    parts.push(`Current state: ${ctx.currentState}`);

  if (ctx.currentWeekLabel)
    parts.push(`Most recent completed week on record: ${ctx.currentWeekLabel}`);

  if (ctx.currentWeekSummary)
    parts.push(`That week's summary: ${ctx.currentWeekSummary}`);

  if (ctx.behavioralPatterns?.length)
    parts.push(`Known patterns about this user:\n${ctx.behavioralPatterns.map(p => `- ${p}`).join('\n')}`);

  if (ctx.relevantPatternsFromQuery?.length)
    parts.push(`Relevant patterns for this query:\n${ctx.relevantPatternsFromQuery.map(p => `- ${p}`).join('\n')}`);

  if (ctx.similarPastWeeks?.length)
    parts.push(`Similar past periods:\n${ctx.similarPastWeeks.map(w => `- ${w}`).join('\n')}`);

  if (ctx.significantEpisodes?.length)
    parts.push(`Relevant past episodes:\n${ctx.significantEpisodes.map(e => `- ${e}`).join('\n')}`);

  if (ctx.dominantSignals?.length)
    parts.push(`Dominant signals this week: ${ctx.dominantSignals.join(', ')}`);

  return parts.join('\n\n') || 'No behavioral data available yet. Encourage user to start logging.';
}

module.exports = { callLLM };