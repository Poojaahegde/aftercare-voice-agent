# Case study: a voice agent for the part of shopping that breaks

## Product question

When a delivery is late or an item arrives damaged, customers want a useful next step quickly. A generic bot can make the experience worse if it invents an order status or promises a refund it cannot authorize. I built Aftercare to test a narrower question: **Can a voice agent handle common exceptions while keeping its decisions grounded and easy to review?**

## User and scope

The user is a customer calling about one of three synthetic ecommerce orders. The prototype covers delivery delays, damage, and return requests. It ends with a **local draft** for a person to review. There is no real customer data or downstream integration.

I chose this scope because the product decision is visible: what can the agent safely resolve, and where should it stop? A working voice interaction alone would not answer that question.

## Flow

1. The agent asks what went wrong.
2. It asks for or recognizes one of three sample order IDs.
3. A local policy uses the known order status and sample return window to propose a next step.
4. The customer confirms before a draft is prepared.
5. The interface shows the transcript, policy flags, outcome, and downloadable support brief.

Voice input is one turn at a time. Typed input remains available when speech recognition is unsupported or fails. Speech output can be turned off.

## Decisions and tradeoffs

| Decision | Why |
| --- | --- |
| The policy layer owns the final action | A model can misclassify an utterance; it should not approve refunds or fabricate order data. |
| The model is optional | Reviewers can run the prototype and its evaluations without credentials or API costs. |
| Order IDs are synthetic and allowlisted | Makes grounding behavior testable and avoids a misleading claim of real integration. |
| Private details are withheld | Contact and payment information is unnecessary for these demo flows. |
| A draft is the terminal artifact | The prototype demonstrates a useful handoff without claiming live customer operations. |

## Quality bar

The evaluation lab runs **eleven scripted conversations** across completion, policy, grounding, privacy, recovery, and escalation. Each scenario asserts the final phase or outcome and, where relevant, the exact next-step category or transcript redaction. The UI exposes the full simulated transcript for inspection.

The current scenarios are synthetic and deterministic. Passing them does **not** establish production quality. A real rollout would require consent design, telephony and speech latency measurement, accent and background-noise testing, order-system accuracy checks, human-review procedures, accessibility tests, privacy review, and monitored A/B testing against the existing support flow.

## Measures I would use in a pilot

- **Correct resolution rate:** share of calls that produce the right next step, verified by human review.
- **Unsafe promise rate:** share of calls that incorrectly promise a refund, label, or policy exception.
- **Grounding error rate:** share of calls that state an order fact absent from the order system.
- **Handoff completeness:** share of human handoffs with the issue, verified order, and attempted action present.
- **Customer effort:** turns to a useful next step and repeat-contact rate.

The release gate would require a very low unsafe-promise and grounding-error rate before increasing automated resolution. I would review failures by intent, speech recognition quality, and policy branch rather than relying only on a single pass-rate number.

## Next iteration

Connect a sandbox order API and a ticketing sandbox; measure end-to-end latency; add adversarial and noisy-audio evaluations; and test handoff language with actual support agents. I would keep real refunds and policy exceptions under human authorization until the evidence supports a different boundary.
