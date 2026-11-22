// Thin client for the Google Gemini API (free tier available via Google AI Studio).
// Uses plain fetch (Node 18+) so there is no SDK version to keep up with.

const { config } = require('../../config/env');

const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
const TIMEOUT_MS = 30000;
const EMBEDDING_DIMENSIONS = 768;

class AIUnavailableError extends Error {}

function isConfigured() {
  return Boolean(config.gemini.apiKey);
}

async function post(path, body) {
  if (!isConfigured()) throw new AIUnavailableError('GEMINI_API_KEY is not configured');

  const res = await fetch(`${BASE_URL}/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': config.gemini.apiKey },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS)
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const err = new Error(`Gemini API ${res.status}: ${text.slice(0, 300)}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

// history: [{ role: 'user' | 'assistant', content }]
async function generateChat({ systemPrompt, history = [], message }) {
  const contents = [
    ...history.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
    { role: 'user', parts: [{ text: message }] }
  ];

  const data = await post(`models/${config.gemini.chatModel}:generateContent`, {
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents,
    generationConfig: { temperature: 0.6, maxOutputTokens: 1024 }
  });

  const candidate = data.candidates?.[0];
  const text = candidate?.content?.parts?.map(p => p.text || '').join('').trim();
  if (!text) {
    const reason = candidate?.finishReason || data.promptFeedback?.blockReason || 'empty response';
    throw new Error(`Gemini returned no text (${reason})`);
  }
  return text;
}

// taskType: 'RETRIEVAL_DOCUMENT' for stored memories, 'RETRIEVAL_QUERY' for search queries.
async function embed(text, taskType = 'RETRIEVAL_DOCUMENT') {
  const data = await post(`models/${config.gemini.embeddingModel}:embedContent`, {
    content: { parts: [{ text }] },
    taskType,
    outputDimensionality: EMBEDDING_DIMENSIONS
  });
  const values = data.embedding?.values;
  if (!Array.isArray(values) || !values.length) throw new Error('Gemini returned no embedding');
  return values;
}

module.exports = { generateChat, embed, isConfigured, AIUnavailableError };
