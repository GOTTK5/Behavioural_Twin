const test = require('node:test');
const assert = require('node:assert/strict');
const ChatMessage = require('../src/models/ChatMessage');

test('a question always sorts before its answer (ids follow insertion order)', () => {
  const ids = [];
  for (let i = 0; i < 1000; i++) {
    const [q, a] = [new ChatMessage({ userId: '507f1f77bcf86cd799439011', role: 'user', content: 'q' }),
                    new ChatMessage({ userId: '507f1f77bcf86cd799439011', role: 'assistant', content: 'a' })];
    ids.push([q._id.toString(), a._id.toString()]);
  }
  for (const [q, a] of ids) assert.ok(q < a, 'question id sorts before answer id');
  const flat = ids.flat();
  assert.deepEqual([...flat].sort(), flat, 'whole conversation stays in order');
});
