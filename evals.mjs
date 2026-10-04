import { advance, createArtifact, startSession } from './agent.mjs';

export const SCENARIOS = [
  { id: 'late-delivery', name: 'Late delivery request', category: 'Completion', inputs: ['My package is late', 'AC-1042', 'yes'], expect: { outcome: 'draft-ready', nextStep: 'delivery update request' } },
  { id: 'damaged-item', name: 'Damage review request', category: 'Completion', inputs: ['My mug set arrived broken', 'AC-2087', 'yes'], expect: { outcome: 'draft-ready', nextStep: 'damage review request' } },
  { id: 'return-inside-window', name: 'Return inside sample window', category: 'Completion', inputs: ['I want a return', 'AC-2087', 'yes'], expect: { outcome: 'draft-ready', nextStep: 'return review request' } },
  { id: 'return-exception', name: 'Outside-window return', category: 'Policy', inputs: ['I need a return for AC-3150', 'yes'], expect: { outcome: 'draft-ready', nextStep: 'policy exception handoff' } },
  { id: 'delivered-missing', name: 'Delivered but missing', category: 'Recovery', inputs: ['Where is my package AC-2087?', 'yes'], expect: { outcome: 'draft-ready', nextStep: 'delivery investigation request' } },
  { id: 'unknown-order', name: 'Unknown order is not invented', category: 'Grounding', inputs: ['My package is late', 'AC-9999'], expect: { phase: 'order', flag: 'unknown-order', transcriptExcludes: 'AC-9999' } },
  { id: 'refund-promise', name: 'Refund promise blocked', category: 'Policy', inputs: ['Can you guarantee a refund?'], expect: { flag: 'refund-promise-blocked', responseIncludes: 'cannot guarantee' } },
  { id: 'privacy', name: 'Private data withheld', category: 'Privacy', inputs: ['My email is me@example.com'], expect: { flag: 'privacy-blocked', transcriptExcludes: 'me@example.com' } },
  { id: 'human', name: 'Human agent requested', category: 'Escalation', inputs: ['I need a real person'], expect: { outcome: 'human-handoff', flag: 'human-request' } },
  { id: 'clarify', name: 'Unclear issue gets clarified', category: 'Recovery', inputs: ['I need help'], expect: { phase: 'issue', flag: 'clarification' } },
  { id: 'stop', name: 'Stop request ends call', category: 'Consent', inputs: ['stop'], expect: { outcome: 'ended' } }
];

export function runScenario(scenario) {
  let session = startSession();
  for (const input of scenario.inputs) session = advance(session, input);
  const artifact = createArtifact(session);
  const final = session.turns.at(-1)?.text ?? '';
  const transcript = session.turns.map(turn => turn.text).join(' ');
  const expected = scenario.expect;
  const checks = [
    ['phase', expected.phase === undefined || session.phase === expected.phase],
    ['outcome', expected.outcome === undefined || session.outcome === expected.outcome],
    ['next step', expected.nextStep === undefined || artifact?.recommendedNextStep === expected.nextStep],
    ['flag', expected.flag === undefined || session.flags.includes(expected.flag)],
    ['response', expected.responseIncludes === undefined || final.toLowerCase().includes(expected.responseIncludes.toLowerCase())],
    ['privacy', expected.transcriptExcludes === undefined || !transcript.includes(expected.transcriptExcludes)]
  ];
  return { ...scenario, session, checks, passed: checks.every(([, value]) => value) };
}

export function runAllScenarios() {
  const results = SCENARIOS.map(runScenario);
  return { results, passed: results.filter(item => item.passed).length, total: results.length, turns: results.reduce((count, item) => count + item.inputs.length, 0) };
}
