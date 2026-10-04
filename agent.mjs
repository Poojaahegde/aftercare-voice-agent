// Aftercare is a synthetic voice-agent prototype for ecommerce delivery issues.
// The policy engine makes all decisions. No order lookup, refund, ticket, or handoff is real.

export const ORDERS = [
  { id: 'AC-1042', item: 'Canvas weekender', status: 'Delayed in transit', returnEligible: false, detail: 'The latest sample carrier scan is pending.' },
  { id: 'AC-2087', item: 'Ceramic mug set', status: 'Delivered', returnEligible: true, detail: 'Inside the sample 30-day return window.' },
  { id: 'AC-3150', item: 'Desk lamp', status: 'Delivered', returnEligible: false, detail: 'Outside the sample 30-day return window.' }
];

const OPENING = 'Hi, I’m Aftercare, a demo support voice agent. I can help with a late delivery, a damaged item, or a return using sample orders. What happened?';
const SENSITIVE = /(?:\b\d{3}[-. ]\d{3}[-. ]\d{4}\b|\b\d{10}\b|\b\d{13,19}\b|\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b|\b(?:credit card|card number|bank account|social security|ssn|home address|street address)\b|\b\d{1,5}\s+[A-Z][A-Z ]+\s+(?:street|st\.?|avenue|ave\.?|road|rd\.?|drive|dr\.?)\b)/i;
const STOP = /\b(?:stop|end (?:the )?call|end (?:the )?chat|goodbye|bye|do not contact|don't contact)\b/i;
const HUMAN = /\b(?:human|real person|representative|support agent|talk to (?:a |an )?person|speak to (?:a |an )?person)\b/i;
const PROMISE = /\b(?:guarantee|promise|immediate refund|refund now|refund me now|approve (?:my |the )?refund|send me money)\b/i;
const YES = /\b(?:yes|yeah|yep|sure|okay|ok|please|sounds good|go ahead|i do)\b/i;
const NO = /\b(?:no|nope|not now|not today|i don't|i do not)\b/i;

export function isSensitive(text) { return SENSITIVE.test(String(text)); }
export function findOrder(text) {
  const id = String(text).toUpperCase().match(/\bAC[- ]?(1042|2087|3150)\b/)?.[1];
  if (id) return ORDERS.find(order => order.id === `AC-${id}`) ?? null;
  const lower = String(text).toLowerCase();
  return ORDERS.find(order => lower.includes(order.item.toLowerCase())) ?? null;
}
export function classifyLocally(text) {
  const value = String(text).toLowerCase();
  let issue = 'unknown';
  if (/\b(?:damage|damaged|broken|shattered|cracked|arrived in pieces)\b/.test(value)) issue = 'damage';
  else if (/\b(?:return|send it back|exchange|don't want it|do not want it)\b/.test(value)) issue = 'return';
  else if (/\b(?:late|delay|delayed|where is|not arrived|missing|tracking|delivery|package)\b/.test(value)) issue = 'delivery';
  return { issue, orderId: findOrder(text)?.id ?? '' };
}

export function startSession() {
  return { status: 'active', phase: 'issue', issue: null, orderId: null, outcome: null, flags: [],
    turns: [{ speaker: 'agent', text: OPENING }] };
}

function respond(session, text, changes = {}, userText = null) {
  return { ...session, ...changes, flags: changes.flag ? [...session.flags, changes.flag] : session.flags,
    turns: [...session.turns, ...(userText === null ? [] : [{ speaker: 'user', text: userText }]), { speaker: 'agent', text }] };
}

function issueLabel(issue) { return { delivery: 'late delivery', damage: 'damaged item', return: 'return' }[issue] ?? 'issue'; }

function outcomeFor(issue, order) {
  if (issue === 'delivery' && order.status === 'Delayed in transit') return {
    action: 'delivery update request',
    message: `${order.id} is delayed in transit. ${order.detail} I can prepare a delivery update request for human review. Should I draft it?`
  };
  if (issue === 'delivery') return {
    action: 'delivery investigation request',
    message: `${order.id} is marked delivered in this sample data. I cannot verify where it was left. I can prepare a delivery investigation request for a person to review. Should I draft it?`
  };
  if (issue === 'damage') return {
    action: 'damage review request',
    message: `I can prepare a damage review request for ${order.item}. A person would decide the remedy; I cannot promise a refund. Should I draft it?`
  };
  if (order.returnEligible) return {
    action: 'return review request',
    message: `${order.id} is inside the sample return window. I can draft a return review request; this does not issue a label or approve a refund. Should I draft it?`
  };
  return {
    action: 'policy exception handoff',
    message: `${order.id} is outside the sample return window. I cannot approve an exception. I can prepare a human-review handoff. Should I draft it?`
  };
}

export function advance(session, input, interpretation = null) {
  if (!session || session.status !== 'active') return session;
  const raw = String(input ?? '').trim().slice(0, 400);
  if (!raw) return respond(session, 'I did not catch that. Tell me if your sample order is late, damaged, or needs a return.');
  if (isSensitive(raw)) return respond(session,
    'Please do not share a phone number, address, payment detail, or email in this demo. A sample order ID is enough.',
    { flag: 'privacy-blocked' }, '[Private detail withheld]');
  if (STOP.test(raw)) return respond(session, 'Understood. I have ended this demo call. Nothing was sent or saved.',
    { status: 'ended', phase: 'done', outcome: 'ended' }, raw);
  if (HUMAN.test(raw)) return respond(session, 'I will mark this as a request for a human support agent. This demo does not contact anyone.',
    { status: 'ended', phase: 'done', outcome: 'human-handoff', flag: 'human-request' }, raw);
  if (PROMISE.test(raw)) return respond(session,
    'I cannot guarantee a refund or approve an exception. A human support agent would review the case. ' + (session.phase === 'issue' ? 'Was the sample order late, damaged, or a return?' : 'Please continue with the sample order ID.'),
    { flag: 'refund-promise-blocked' }, raw);

  const local = classifyLocally(raw);
  const hint = interpretation && typeof interpretation === 'object' ? interpretation : {};
  const issue = local.issue !== 'unknown' ? local.issue : ['delivery','damage','return'].includes(hint.issue) ? hint.issue : 'unknown';
  // The model may interpret a request, but it cannot select an order absent from the customer's words.
  const order = findOrder(raw);

  if (session.phase === 'issue') {
    if (issue === 'unknown') return respond(session, 'I can help with a late delivery, a damaged item, or a return. Which one happened?', { flag: 'clarification' }, raw);
    const next = { ...session, issue };
    if (order) {
      const decision = outcomeFor(issue, order);
      return respond(next, decision.message, { phase: 'confirm', orderId: order.id }, raw);
    }
    return respond(next, `I can help with that ${issueLabel(issue)}. Which sample order is it: AC-1042, AC-2087, or AC-3150?`, { phase: 'order' }, raw);
  }

  if (session.phase === 'order') {
    if (!order) return respond(session, 'I only have three synthetic orders: AC-1042, AC-2087, and AC-3150. Which one should I use?', { flag: 'unknown-order' }, '[Unrecognized order reference]');
    const decision = outcomeFor(session.issue, order);
    return respond(session, decision.message, { phase: 'confirm', orderId: order.id }, raw);
  }

  if (session.phase === 'confirm') {
    if (YES.test(raw)) {
      const chosen = ORDERS.find(item => item.id === session.orderId);
      const decision = outcomeFor(session.issue, chosen);
      return respond(session, `Your sample ${decision.action} for ${chosen.id} is ready to review. No real ticket, label, message, or refund was created.`,
        { status: 'ended', phase: 'done', outcome: 'draft-ready' }, raw);
    }
    if (NO.test(raw)) return respond(session, 'No draft was created. Tell me if you want help with another sample order.',
      { phase: 'issue', issue: null, orderId: null }, raw);
    return respond(session, 'Should I prepare this request for human review? Please say yes or no.', { flag: 'clarification' }, raw);
  }
  return session;
}

export function createArtifact(session) {
  if (session?.outcome !== 'draft-ready') return null;
  const order = ORDERS.find(item => item.id === session.orderId);
  const decision = outcomeFor(session.issue, order);
  return { type: 'sample support brief', orderId: order.id, item: order.item,
    issue: issueLabel(session.issue), recommendedNextStep: decision.action,
    status: 'local draft only', note: 'No real ticket, label, refund, CRM write, or customer contact.' };
}
