import { advance, classifyLocally, createArtifact, isSensitive, ORDERS, startSession } from './agent.mjs';
import { runAllScenarios, SCENARIOS } from './evals.mjs';

const $ = id => document.getElementById(id);
const speechClass = window.SpeechRecognition || window.webkitSpeechRecognition;
let session = null;
let report = null;
let busy = false;
let recognition = null;
let aiAvailable = false;

const phaseNames = { issue: 'Understand issue', order: 'Find sample order', confirm: 'Confirm next step', done: 'Complete' };
const outcomeNames = { 'draft-ready': 'Brief ready', 'human-handoff': 'Human requested', ended: 'Call ended' };

function speak(text) {
  if (!$('sound-toggle').checked || !('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'en-US';
  utterance.rate = 0.98;
  window.speechSynthesis.speak(utterance);
}

function renderTranscript() {
  const box = $('transcript');
  box.replaceChildren();
  if (!session) {
    const empty = document.createElement('p'); empty.className = 'empty-transcript';
    empty.textContent = 'Your conversation appears here. Try “My package is late” or “I want to return an item.”';
    box.append(empty); return;
  }
  for (const turn of session.turns) {
    const row = document.createElement('div'); row.className = `message ${turn.speaker}`;
    const label = document.createElement('span'); label.className = 'message-label'; label.textContent = turn.speaker === 'agent' ? 'Aftercare agent' : 'You';
    const bubble = document.createElement('span'); bubble.className = 'message-bubble'; bubble.textContent = turn.text;
    row.append(label, bubble); box.append(row);
  }
  box.scrollTop = box.scrollHeight;
}

function renderState() {
  const active = session?.status === 'active';
  $('message-input').disabled = !active || busy;
  $('send-button').disabled = !active || busy;
  $('mic-button').disabled = !active || busy || !speechClass;
  $('replay-button').disabled = !session;
  $('start-button').textContent = session ? 'Start again' : 'Start conversation';
  $('call-status').className = `status-dot ${session ? active ? 'status-active' : 'status-ended' : 'status-idle'}`;
  $('call-status').setAttribute('aria-label', session ? active ? 'Call active' : 'Call ended' : 'Call idle');
  $('state-step').textContent = session ? phaseNames[session.phase] : 'Waiting to start';
  $('state-turns').textContent = String(session?.turns.filter(turn => turn.speaker === 'user').length ?? 0);
  $('state-flags').textContent = session?.flags.length ? [...new Set(session.flags)].join(', ').replaceAll('-', ' ') : 'None';
  $('state-outcome').textContent = session?.outcome ? outcomeNames[session.outcome] ?? session.outcome : '—';
  const artifact = createArtifact(session);
  $('artifact-panel').hidden = !artifact;
  if (artifact) {
    $('artifact-title').textContent = `${artifact.orderId} · ${artifact.issue}`;
    $('artifact-meta').textContent = `${artifact.recommendedNextStep} · ${artifact.status}`;
  }
  renderTranscript();
}

function start() {
  window.speechSynthesis?.cancel();
  recognition?.abort();
  recognition = null;
  session = startSession();
  renderState();
  $('message-input').focus();
  speak(session.turns.at(-1).text);
}

async function getInterpretation(text) {
  if (isSensitive(text) || !aiAvailable) return classifyLocally(text);
  try {
    const response = await fetch('./api/interpret', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ utterance: text, phase: session.phase }) });
    if (!response.ok) throw new Error('Unavailable');
    const data = await response.json();
    $('mode-label').textContent = data.mode === 'model' ? 'AI intent + policy' : 'Local policy fallback';
    return data;
  } catch {
    $('mode-label').textContent = 'Local policy fallback';
    return classifyLocally(text);
  }
}

async function sendTurn(text) {
  const clean = text.trim().slice(0, 400);
  if (!clean || busy || !session || session.status !== 'active') return;
  busy = true; renderState();
  const hint = await getInterpretation(clean);
  session = advance(session, clean, hint);
  busy = false;
  $('message-input').value = '';
  renderState();
  speak(session.turns.at(-1).text);
  if (session.status === 'active') $('message-input').focus();
}

function startListening() {
  if (!speechClass || !session || session.status !== 'active') return;
  window.speechSynthesis?.cancel();
  recognition = new speechClass();
  recognition.lang = 'en-US';
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;
  recognition.onstart = () => { $('mic-button').classList.add('listening'); $('voice-note').textContent = 'Listening for one turn…'; };
  recognition.onresult = event => { const text = event.results?.[0]?.[0]?.transcript; if (text) sendTurn(text); };
  recognition.onerror = event => { $('voice-note').textContent = `Microphone unavailable (${event.error}). You can type instead.`; };
  recognition.onend = () => { $('mic-button').classList.remove('listening'); recognition = null; if (!$('voice-note').textContent.includes('unavailable')) $('voice-note').textContent = 'Voice turn complete. You can speak again or type.'; };
  try { recognition.start(); } catch { $('voice-note').textContent = 'Microphone unavailable. You can type instead.'; }
}

function renderCatalog() {
  const box = $('order-catalog'); box.replaceChildren();
  for (const order of ORDERS) {
    const row = document.createElement('div'); row.className = 'event-item';
    const color = document.createElement('span'); color.className = 'event-color'; color.setAttribute('aria-hidden', 'true');
    const details = document.createElement('div');
    const title = document.createElement('strong'); title.textContent = `${order.id} · ${order.item}`;
    const status = document.createElement('span'); status.textContent = order.status;
    details.append(title, status);
    const button = document.createElement('button'); button.type = 'button'; button.textContent = 'Try';
    button.setAttribute('aria-label', `Try sample order ${order.id}`);
    button.addEventListener('click', async () => {
      if (!session || session.status !== 'active') start();
      const prompt = order.id === 'AC-1042' ? `My package ${order.id} is late` : `I want to return ${order.id}`;
      await sendTurn(prompt);
      document.querySelector('#conversation').scrollIntoView({ behavior: 'smooth' });
    });
    row.append(color, details, button); box.append(row);
  }
}

function renderScenarios() {
  const box = $('scenario-list'); box.replaceChildren();
  const list = report?.results ?? SCENARIOS.map(item => ({ ...item, passed: null }));
  for (const scenario of list) {
    const button = document.createElement('button'); button.type = 'button';
    button.className = `scenario-item ${scenario.passed === false ? 'failed' : ''}`;
    const category = document.createElement('span'); category.textContent = scenario.category;
    const title = document.createElement('strong'); title.textContent = scenario.name;
    const state = document.createElement('small'); state.textContent = scenario.passed === null ? 'Run to inspect →' : scenario.passed ? 'Passed · inspect →' : 'Failed · inspect →';
    button.append(category, title, state);
    button.addEventListener('click', () => showScenario(scenario.id)); box.append(button);
  }
}

function showScenario(id) {
  if (!report) return;
  const scenario = report.results.find(item => item.id === id);
  const box = $('scenario-detail'); box.replaceChildren(); box.hidden = false;
  const title = document.createElement('h3'); title.textContent = `${scenario.name} · ${scenario.passed ? 'Passed' : 'Failed'}`;
  const checks = document.createElement('p'); checks.textContent = scenario.checks.map(([name, passed]) => `${name}: ${passed ? 'pass' : 'fail'}`).join('  ·  ');
  const turns = document.createElement('ul');
  for (const turn of scenario.session.turns) {
    const row = document.createElement('li'); row.className = turn.speaker === 'agent' ? 'agent-turn' : '';
    row.textContent = `${turn.speaker === 'agent' ? 'Agent' : 'Customer'}: ${turn.text}`; turns.append(row);
  }
  box.append(title, checks, turns); box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function runEvaluations() {
  report = runAllScenarios();
  $('score-value').textContent = `${report.passed} / ${report.total}`;
  $('turns-value').textContent = String(report.turns);
  $('scenario-detail').hidden = true;
  renderScenarios();
}

function downloadBrief() {
  const artifact = createArtifact(session);
  if (!artifact) return;
  const url = URL.createObjectURL(new Blob([JSON.stringify(artifact, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = 'aftercare-demo-brief.json'; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

$('start-button').addEventListener('click', start);
$('mic-button').addEventListener('click', startListening);
$('replay-button').addEventListener('click', () => { if (session) speak(session.turns.filter(turn => turn.speaker === 'agent').at(-1)?.text ?? ''); });
$('message-form').addEventListener('submit', event => { event.preventDefault(); sendTurn($('message-input').value); });
$('run-evals').addEventListener('click', runEvaluations);
$('download-button').addEventListener('click', downloadBrief);
if (!speechClass) $('voice-note').textContent = 'This browser does not support speech recognition. Text input and voice playback may still work.';
renderCatalog(); renderScenarios(); renderState();
fetch('./api/config').then(response => response.ok ? response.json() : null).then(config => {
  aiAvailable = Boolean(config?.aiAvailable);
  $('mode-label').textContent = aiAvailable ? 'AI intent + local policy' : 'Local policy demo';
}).catch(() => {});
