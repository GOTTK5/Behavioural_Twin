const test = require('node:test');
const assert = require('node:assert/strict');

process.env.GEMINI_API_KEY = 'test-key';
process.env.GEMINI_MODEL = 'gemini-2.5-flash'; // pretend this one was retired
const gemini = require('../src/modules/ai/gemini');

test('ranks chat models: newest stable flash first, specialised variants skipped', () => {
  const models = [
    'gemini-2.5-flash', 'gemini-3.5-flash-lite', 'gemini-3.8-flash', 'gemini-3.8-pro',
    'gemini-3.8-flash-image', 'gemini-4.0-flash-preview', 'gemini-embedding-001'
  ].map(n => ({ name: `models/${n}`, supportedGenerationMethods: n.includes('embedding') ? ['embedContent'] : ['generateContent'] }));
  const ranked = gemini.rankChatModels(models);
  assert.equal(ranked[0], 'gemini-3.8-flash');
  assert.ok(!ranked.includes('gemini-3.8-flash-image'));
  assert.ok(!ranked.includes('gemini-embedding-001'));
  assert.ok(ranked.indexOf('gemini-3.8-pro') > ranked.indexOf('gemini-3.5-flash-lite'));
});

test('switches to an available model when the configured one returns 404', async () => {
  const calls = [];
  global.fetch = async (url) => {
    calls.push(url);
    const json = (status, body) => ({ ok: status < 300, status, json: async () => body, text: async () => JSON.stringify(body) });
    if (url.includes('gemini-2.5-flash:generateContent')) return json(404, { error: { message: 'models/gemini-2.5-flash is not found' } });
    if (url.includes('/models?')) return json(200, { models: [
      { name: 'models/gemini-2.5-flash', supportedGenerationMethods: ['generateContent'] },
      { name: 'models/gemini-3.8-flash', supportedGenerationMethods: ['generateContent'] }
    ] });
    if (url.includes('gemini-3.8-flash:generateContent')) return json(200, { candidates: [{ content: { parts: [{ text: 'Hello!' }] } }] });
    return json(500, {});
  };
  const reply = await gemini.generateChat({ systemPrompt: 's', message: 'hi' });
  assert.equal(reply, 'Hello!');
  // later calls go straight to the working model
  calls.length = 0;
  await gemini.generateChat({ systemPrompt: 's', message: 'again' });
  assert.equal(calls.length, 1);
  assert.match(calls[0], /gemini-3\.8-flash:generateContent/);
});

test('plain-language errors', () => {
  assert.match(gemini.describeError(Object.assign(new Error('API key not valid'), { status: 400 })), /invalid/);
  assert.match(gemini.describeError(Object.assign(new Error('x'), { status: 429 })), /quota/);
});

test('retries on 503 and falls back to another model when one stays overloaded', async () => {
  process.env.GEMINI_MODEL = 'gemini-busy';
  delete require.cache[require.resolve('../src/modules/ai/gemini')];
  const g = require('../src/modules/ai/gemini');
  let busyCalls = 0;
  global.fetch = async (url) => {
    const json = (status, body) => ({ ok: status < 300, status, json: async () => body, text: async () => JSON.stringify(body) });
    if (url.includes('gemini-busy:generateContent')) { busyCalls++; return json(503, { error: { message: 'high demand' } }); }
    if (url.includes('/models?')) return json(200, { models: [
      { name: 'models/gemini-busy', supportedGenerationMethods: ['generateContent'] },
      { name: 'models/gemini-9.0-flash-lite', supportedGenerationMethods: ['generateContent'] }
    ] });
    if (url.includes('gemini-9.0-flash-lite:generateContent')) return json(200, { candidates: [{ content: { parts: [{ text: 'Backup answer' }] } }] });
    return json(500, {});
  };
  assert.equal(await g.generateChat({ systemPrompt: 's', message: 'hi' }), 'Backup answer');
  assert.equal(busyCalls, 3); // 1 try + 2 retries
});
