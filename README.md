# Sales Agent for Zendesk

This project is an autonomous sales agent that runs your Zendesk sales conversations in HubSpot, end to end.

It is built to do the work a strong async sales rep does:
- respond fast,
- stay accurate,
- qualify without interrogating,
- move deals forward with clear next steps,
- and keep CRM clean without manual cleanup.

## What It Does for You

### 1) Replies to inbound leads automatically
When a new email arrives, the agent:
- understands the buyer intent,
- answers the question directly,
- asks at most one high-value follow-up when needed,
- logs the draft into HubSpot.

### 2) Runs multi-turn conversations without losing context
Across reply chains, it tracks:
- what the buyer already shared,
- what has already been asked,
- what still blocks deal progression.

It avoids repeating questions and adapts when the buyer is vague, tired, or price-sensitive.

### 3) Qualifies and updates CRM as it learns
As information appears in conversation, it fills key deal fields such as:
- primary pain and challenges,
- timeline,
- number of agents,
- support channels,
- ticket volume.

It also refreshes a structured `deal_summary` so each new turn starts with current context.

### 4) Controls stage progression based on evidence
Deals only advance when requirements are actually met (not guessed), including:
- required qualification data,
- pricing evidence in sent drafts,
- line items created,
- invoice link sent,
- invoice paid before closed-won.

### 5) Handles pricing and quoting flow
If pricing intent appears, the agent can:
- pull official catalog pricing,
- send compliant pricing responses,
- create line items and draft invoices,
- include invoice links in customer-ready drafts.

### 6) Re-engages stale deals automatically
Scheduled workflows detect inactive deals and trigger follow-ups that:
- reference prior context,
- keep asks minimal,
- try to revive momentum without pushy outreach.

### 7) Reviews closed-lost opportunities for revival
A separate cron can evaluate closed-lost deals and selectively re-open/re-engage when conditions support it.

### 8) Makes autonomous decisions in hard scenarios
The agent handles real-world sales friction without human escalation:
- declines call/meeting requests (async-only model),
- declines discount requests,
- handles out-of-scope or spam messages,
- closes non-fit deals with logged rationale.

## Why Teams Use It

- Fewer dropped leads: every inbound gets handled.
- Higher CRM quality: summaries and fields stay current.
- Better consistency: the same guardrails apply every time.
- More pipeline momentum: next actions are always explicit.
- Less rep busywork: drafting, logging, and stage hygiene are automated.

## Typical Journey

1. Prospect emails with a question.
2. Agent drafts and logs a response in HubSpot.
3. Conversation continues with targeted qualification.
4. Agent updates deal data and summary after each run.
5. When appropriate, agent shares pricing, creates line items, and prepares invoice flow.
6. Deal advances only when evidence exists for the next stage.

## Minimal Run Commands

- Start agent runtime: `bun run dev`
- Run stale-deal reactivation job: `bun run cron:stale-deals`
- Run closed-lost review/re-engagement: `bun run cron:dead-opps`
- Run evaluation conversations: `bun run eval -- --count 5 --concurrency 2`
