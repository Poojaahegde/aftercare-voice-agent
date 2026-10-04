import test from 'node:test';
import assert from 'node:assert/strict';
import { advance, classifyLocally, createArtifact, findOrder, isSensitive, startSession } from './agent.mjs';
import { runAllScenarios } from './evals.mjs';

test('all scripted conversation scenarios meet their quality gates', () => {
  const report = runAllScenarios();
  assert.equal(report.total, 11);
  assert.equal(report.passed, report.total, report.results.filter(item => !item.passed).map(item => item.id).join(', '));
});

test('sensitive data never enters transcript or brief', () => {
  const session = advance(startSession(), 'My email is me@example.com');
  assert.equal(session.flags.includes('privacy-blocked'), true);
  assert.equal(JSON.stringify(session).includes('me@example.com'), false);
  assert.equal(createArtifact(session), null);
  assert.equal(isSensitive('My card number is 4111111111111111'), true);
});

test('only known synthetic orders can be resolved', () => {
  assert.equal(findOrder('AC-1042')?.status, 'Delayed in transit');
  assert.equal(findOrder('AC-9999'), null);
  assert.equal(classifyLocally('my mug set is broken').issue, 'damage');
});

test('completed session cannot accept more turns', () => {
  const ended = advance(startSession(), 'stop');
  assert.equal(advance(ended, 'AC-1042'), ended);
});

test('model hint cannot override a privacy block', () => {
  const session = advance(startSession(), 'me@example.com', { issue: 'delivery', orderId: 'AC-1042' });
  assert.equal(session.phase, 'issue');
  assert.equal(session.flags.includes('privacy-blocked'), true);
});

test('model hint cannot invent an order lookup', () => {
  let session = advance(startSession(), 'my package is late', { issue: 'delivery', orderId: 'AC-3150' });
  assert.equal(session.phase, 'order');
  assert.equal(session.orderId, null);
  session = advance(session, 'AC-1042', { issue: 'return', orderId: 'AC-3150' });
  assert.equal(session.orderId, 'AC-1042');
});
