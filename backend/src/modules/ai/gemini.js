// Thin client for the Google Gemini API (free tier available via Google AI Studio).
// Uses plain fetch (Node 18+) so there is no SDK version to keep up with.
//
// Google retires model versions regularly. If the configured model is gone
// (404), the client asks the API which models this key can use and switches
// to the best available one automatically, so the app keeps working.

const { config } = require('../../config/env');

const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
const TIMEOUT_MS = 30000;
const EMBEDDING_DIMENSIONS = 768;

class AIUnavailableError extends Error {}

function isConfigured() {
  return Boolean(config.gemini.apiKey);
}

async function request(method, path, body) {
  if (!isConfigured()) throw new AIUnavailableError('GEMINI_API_KEY is not configured');

  const res = await fetch(`${BASE_URL}/${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': config.gemini.apiKey },
    body: body ? JSON.stringify(body) : undefined,
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

// ── Model discovery ───────────────────────────────────
let modelListCache = null;

async function listModels() {
  if (modelListCache) return modelListCache;
  const models = [];
  let pageToken = '';
  do {
    const data = await request('GET', `models?pageSize=1000${pageToken ? `&pageToken=${pageToken}` : ''}`);
    models.push(...(data.models || []));
    pageToken = data.nextPageToken || '';
  } while (pageToken);
  modelListCache = models;
  return models;
}

// Higher version number first; stable before preview; "flash" (fast, free-tier friendly)
// before "pro"; skip specialised variants that can't hold a normal chat.
function rankChatModels(models) {
  const SKIP = /(image|tts|audio|live|vision|embedding|aqa|thinking-exp|robotics|computer-use|native)/i;
  const version = (name) => parseFloat((name.match(/gemini-(\d+(?:\.\d+)?)/) || [])[1] || 0);
  return models
    .filter(m => (m.supportedGenerationMethods || []).includes('generateContent'))
    .map(m => m.name.replace(/^models\//, ''))
    .filter(n => n.startsWith('gemini') && !SKIP.test(n))
    .sort((a, b) => {
      const score = (n) =>
        (/flash/.test(n) ? 0 : 10) +          // prefer flash
        (/lite/.test(n) ? 1 : 0) +            // full flash over lite
        (/preview|exp/.test(n) ? 5 : 0) +     // stable over preview
        (/-\d{3}$|-\d{2}-\d{4}$/.test(n) ? 0.5 : 0); // aliases over pinned snapshots
      return score(a) - score(b) || version(b) - version(a);
    });
}

function rankEmbeddingModels(models) {
  return models
    .filter(m => (m.supportedGenerationMethods || []).includes('embedContent'))
    .map(m => m.name.replace(/^models\//, ''))
    .sort((a, b) => (/gemini-embedding/.test(b) ? 1 : 0) - (/gemini-embedding/.test(a) ? 1 : 0));
}

const active = { chat: null, embedding: null };

// Calls fn(model); on "model not found" switches to the next available model once.
async function withModel(kind, fn) {
  const configured = kind === 'chat' ? config.gemini.chatModel : config.gemini.embeddingModel;
  const current = active[kind] || configured;
  try {
    return await fn(current);
  } catch (err) {
    if (err.status !== 404 && err.status !== 400) throw err;
    if (err.status === 400 && !/model|not supported|not found/i.test(err.message)) throw err;

    const models = await listModels();
    const ranked = kind === 'chat' ? rankChatModels(models) : rankEmbeddingModels(models);
    const next = ranked.find(n => n !== current);
    if (!next) throw err;

    console.warn(`[gemini] ${kind} model "${current}" unavailable — switching to "${next}". Set ${kind === 'chat' ? 'GEMINI_MODEL' : 'GEMINI_EMBEDDING_MODEL'}=${next} to make this permanent.`);
    active[kind] = next;
    return fn(next);
  }
}

// ── Public API ────────────────────────────────────────

// history: [{ role: 'user' | 'assistant', content }]
async function generateChat({ systemPrompt, history = [], message }) {
  const contents = [
    ...history.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
    { role: 'user', parts: [{ text: message }] }
  ];

  const data = await withModel('chat', (model) => request('POST', `models/${model}:generateContent`, {
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents,
    generationConfig: { temperature: 0.6, maxOutputTokens: 2048 }
  }));

  const candidate = data.candidates?.[0];
  const text = candidate?.content?.parts?.filter(p => !p.thought).map(p => p.text || '').join('').trim();
  if (!text) {
    const reason = candidate?.finishReason || data.promptFeedback?.blockReason || 'empty response';
    throw new Error(`Gemini returned no text (${reason})`);
  }
  return text;
}

// taskType: 'RETRIEVAL_DOCUMENT' for stored memories, 'RETRIEVAL_QUERY' for search queries.
async function embed(text, taskType = 'RETRIEVAL_DOCUMENT') {
  const data = await withModel('embedding', (model) => request('POST', `models/${model}:embedContent`, {
    content: { parts: [{ text }] },
    taskType,
    outputDimensionality: EMBEDDING_DIMENSIONS
  }));
  const values = data.embedding?.values;
  if (!Array.isArray(values) || !values.length) throw new Error('Gemini returned no embedding');
  return values;
}

// Small live check used by /api/health?ai=check
async function checkAI() {
  if (!isConfigured()) return { ok: false, error: 'GEMINI_API_KEY is not set' };
  try {
    await generateChat({ systemPrompt: 'Reply with OK.', message: 'ping' });
    return { ok: true, chatModel: active.chat || config.gemini.chatModel };
  } catch (err) {
    return { ok: false, chatModel: active.chat || config.gemini.chatModel, error: describeError(err) };
  }
}

// Plain-language reason for an AI failure (never includes the key).
function describeError(err) {
  if (err instanceof AIUnavailableError) return 'GEMINI_API_KEY is not set';
  if (err.status === 400 && /API key not valid|API_KEY_INVALID/i.test(err.message)) return 'GEMINI_API_KEY is invalid — create a new key in Google AI Studio';
  if (err.status === 403) return 'The Gemini key is not allowed to use this API (check the key / project in Google AI Studio)';
  if (err.status === 404) return 'No usable Gemini model found for this key';
  if (err.status === 429) return 'Gemini free-tier quota reached — wait a minute (or a day if the daily limit is used up)';
  if (err.name === 'TimeoutError') return 'Gemini did not answer in time';
  return err.message.slice(0, 200);
}

module.exports = { generateChat, embed, isConfigured, checkAI, describeError, AIUnavailableError, rankChatModels };
