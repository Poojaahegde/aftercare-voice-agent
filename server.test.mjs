import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, interpret } from './server.mjs';

test('server can be constructed and the local classifier works without a key', async () => {
  const server = createServer({ apiKey: '' });
  assert.equal(server.listening, false);
  const turn = await interpret('My package AC-1042 is late', 'issue', { apiKey: '' });
  assert.equal(turn.mode, 'local');
  assert.equal(turn.issue, 'delivery');
  assert.equal(turn.orderId, 'AC-1042');
  server.close();
});

test('private utterances are blocked before any model call', async () => {
  const result = await interpret('My email is me@example.com', 'issue', { apiKey: 'unused-key' });
  assert.equal(result.mode, 'blocked');
});
