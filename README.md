# Aftercare Voice Agent

A working, independent voice-agent prototype for ecommerce support recovery. It handles late delivery, damaged item, and return conversations using **three synthetic orders**. The agent turns a call into a reviewable support brief and makes its policy decisions inspectable.

**Prototype by Pooja Hegde.** No real orders, refunds, labels, tickets, messages, or customer accounts are connected.

**[Try the live browser demo](https://poojaahegde.github.io/aftercare-voice-agent/)** · [Read the product case study](CASE_STUDY.md)

## Try it

Open the live demo above, or run it locally:

1. Use Node.js 20 or newer.
2. Run `npm start` from this folder.
3. Open `http://localhost:4173`.
4. Click **Start conversation**. Type a message or use the microphone in a browser that supports speech recognition.
5. Click **Run evaluations** to inspect all eleven scripted conversations.

Example prompts:

- “My package is late” → `AC-1042` → “yes”
- “My mug set arrived broken” → “yes”
- “I want to return AC-3150” → “yes”
- “Can you guarantee a refund?”
- “I need a real person”

Run the automated checks with `npm test`. There are no runtime dependencies.

## Optional AI intent mode

The demo runs without an API key using a local classifier and deterministic conversation policy. To enable model-assisted classification locally, set `OPENAI_API_KEY` in your environment before starting the server. You can also set `OPENAI_MODEL` (default `gpt-4o-mini`). The server uses the OpenAI Responses API with a JSON schema to identify the issue and a **known sample order ID**. The key stays server-side.

The model never decides whether a refund is approved, whether a return qualifies, or which order record to use. The policy layer validates order references against the customer's words and known fixtures. If the API is unavailable, the agent falls back to the local classifier. Model mode has not been tested against a live key in this repository; the local path and request guardrails are tested.

Browser speech recognition has limited support. Text input is always available. Speech synthesis uses the browser's built-in voice. Browser speech services may process audio outside this app, so use only sample details. The app holds the demo conversation in memory for the active tab; it does not persist transcripts.

## Product behavior

| Situation | Agent behavior |
| --- | --- |
| Delayed sample order | States the sample status and offers a delivery update request draft |
| Delivered but missing | Offers a human-reviewed investigation request; does not invent a location |
| Damaged item | Offers a damage review request; does not promise a refund |
| Return inside sample window | Prepares a return review request; does not issue a label |
| Return outside sample window | Offers a policy exception handoff; does not approve an exception |
| Unknown order | Asks for one of the known sample IDs; does not invent order data |
| Private details | Withholds the utterance from the transcript and optional model request |
| Human request or stop | Ends with an explicit, honest handoff or termination statement |

## Architecture

- `agent.mjs`: pure conversation state, order fixture grounding, and policy decisions
- `server.mjs`: static app server plus optional, server-side AI intent classification
- `app.mjs`: voice/text interface and reviewable conversation state
- `evals.mjs`: eleven repeatable customer-call scenarios
- `*.test.mjs`: automated policy, privacy, grounding, and server checks
- `CASE_STUDY.md`: the PM problem, tradeoffs, quality bar, and next iteration

## What this does not claim

This is a portfolio prototype, not a production call-center system. It has no telephony, CRM, payment system, real order database, authentication, deployment monitoring, latency SLO, or live customer validation. The scenario pass rate measures only the included synthetic cases.

## References

- [MDN Web Speech API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API)
- [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
