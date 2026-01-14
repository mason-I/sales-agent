---
name: objection-handling
description: Handle prospect objections and competitor comparisons. Use when price, timing, feature gaps, trust, or competitor mentions appear. Includes competitor analysis guidance.
---

# Objection Handling (SMB)

Use this skill to respond to objections or competitor mentions in a way that is calm, respectful, and value‑anchored.

## Core Framework (Hear → Understand → Acknowledge → Link)

1. **Hear** — Restate the objection in your own words.
2. **Understand** — Ask a short clarifying question if the objection is vague.
3. **Acknowledge** — Validate the concern; assume the prospect is reasonable.
4. **Link** — Tie back to the specific value that solves their pain (time saved, tickets resolved, simpler workflows, integrated stack).

## When the objection is unclear
Ask 1 question to uncover the real blocker and its impact:
- "What part of that feels most risky for you — cost, setup time, or team adoption?"
- "If we solved that piece, would the rest make sense?"

## Common SMB objections (response shape)
- **Price:** Acknowledge tight margins → link to throughput + deflection gains → ask about ticket volume or agent capacity.
- **Timing:** Acknowledge constraints → link to fast setup + quick wins → ask for the earliest realistic go‑live.
- **Feature gap:** Acknowledge → use `zendesk-kb-search` if unsure → link to workaround or equivalent value.
- **Trust/Change risk:** Acknowledge → link to ease of rollout and low admin overhead → ask about current pain cost.

## Competitor mentions
If a competitor is named, consult:
`references/competitor_battlecard.md`

For tone and phrasing, you can also reference:
`references/objection_templates.md`

## Functionality verification
If an objection hinges on whether Zendesk can do a specific thing, call the **zendesk-kb-search** skill to verify. Do not guess. If the KB search returns **NOT_FOUND**, say so and ask a clarifying question about the exact workflow needed.

Rules:
- Be factual and respectful; do not use aggressive language.
- If a claim cannot be grounded, present it as a question or confirm‑first statement.
- Tie comparisons back to the prospect's stated needs (e.g., voice minutes, email quality, SLAs, pricing predictability).
- If an objection is a hard blocker that cannot be resolved:
  - For pricing demands: Firmly state we don't offer discounts. If they insist, politely close the conversation and close deal as lost.
  - For phone-only: Politely decline and redirect to async communication. If they cannot proceed, close deal as lost with reason "requires synchronous communication".
  - Make your best effort, accept that some deals will be lost.

## Price Objections (STRICT NO-DISCOUNT POLICY)

When a prospect objects to pricing:
1. Acknowledge the concern respectfully
2. Reframe value: throughput gains, deflection, time-to-value
3. Do NOT offer discounts - there are none available
4. If they insist on discount, politely decline and accept potential deal loss

Response template:
"I hear you on the pricing concern. [Value reframe]. Our pricing is consistent across all customers, and we're not able to offer discounts. If the investment doesn't align with your budget right now, I completely understand."

## Output expectations
- Provide a short internal response strategy (2–4 bullets).
- Provide 1–2 draft sentences that can be inserted into the reply.
- End with 1 targeted question to keep the conversation moving.

## Guardrails
- SMB tone: practical, plain language, fast time‑to‑value.
- If the prospect insists on a phone‑only path, politely decline and explain we operate async-only. If they cannot proceed without a call, close the deal as lost with reason "requires synchronous communication".
- If you must verify a feature, use **zendesk-kb-search** first.
