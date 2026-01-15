# Commitment-Based Progression (Derived-State / Evidence-Driven, SDK-first)

## First Principles

Prospects don’t experience your CRM fields—they experience:

1) “Did you answer my question?”
2) “Did you listen?”
3) “Did you make it easy to buy?”

Field-gated progression incentivizes interrogation. The highest-ROI alternative is to model sales as a **monotonic commitment ladder**, but **recompute commitment state from evidence every turn** (engagement history + structured summary + commercial artifacts), instead of persisting lots of `commitment_*` properties that can drift out of sync.

We have unlimited budget/latency, so we optimize for **correctness, UX, and conversion**, not compute.

## Non-negotiables

- **Deal stage mirrors the commitment** (HubSpot stages map 1:1 to commitments).
- **Commitment state is derived, not stored** (no duplicated “current/next” props).
- **Semantic classification** (StructuredOutput), not regex, for intent and pricing intent.
- **Async-only** (no calls/meetings/demos).
- **Deterministic pricing** from canonical catalog (MCP resource for `data/zendesk-products.json`).

## New HubSpot Stages (create these)

Use these exact stage IDs:

1. Expressed Commercial Intent — `2130118129`
2. Admitted Pain / Gap — `2182866374`
3. Defined Scope & Impact — `2185655765`
4. Established Timeline — `2388431315`
5. Confirmed Agent Count — `2390248940`
6. Confirmed Support Channels — `2388431316`
7. Pricing Discussed — `2388431317`
8. Selected Tier — `2387718587`
9. Quote Sent — `contractsent`
10. Paid (Closed Won) — `closedwon`

Terminal:
- Closed Lost — `closedlost`

## Commitment Ladder (monotonic, derived)

Commitments are achieved based on evidence in:

- `deal_summary` (authoritative; refreshed after every turn via Stop hook)
- Deal properties already captured (enrichment fields)
- Commercial artifacts (line items, invoice/quote link/id)

### Commitments and evidence anchors

1) **Expressed Commercial Intent**
   - Evidence: inbound/reply indicates interest in solving a problem.
2) **Admitted Pain / Gap**
   - Evidence: explicit pain statement; can be inferred with confidence only if clearly implied.
3) **Defined Scope & Impact**
   - Evidence: challenges + ticket volume or other quantification.
4) **Established Timeline**
   - Evidence: time commitment (“ASAP”, “this week”, “Q3”, date).
5) **Confirmed Agent Count**
   - Evidence: numeric sizing for seats/agents.
6) **Confirmed Support Channels**
   - Evidence: channels named (email/chat/voice/etc).
7) **Pricing Discussed**
   - Evidence: pricing intent `explicit` (“price/cost”) or `implied` (“which plan should we buy?”, “what would this cost for ~N?”).
   - Advancement rule: only after we actually send pricing in the reply **and** the catalog resource was read in this turn.
8) **Selected Tier**
   - Evidence: buyer agreement on a tier/SKU in text.
   - Advancement rule: only after line items exist on the deal.
9) **Quote Sent**
   - Evidence: invoice exists AND invoice URL was included in the outbound reply.
10) **Paid**
   - Evidence: invoice status is paid in HubSpot.

## HubSpot deal properties (minimal)

No new custom properties are required. We derive commitment state from:

- `dealstage` (canonical commitment stage)
- Existing enrichment fields (e.g., `sw_primary_pain`, `agents_required`, `support_channels`, etc.)
- Engagement history (for last asks + answers)
- Line items and invoices (for tier/quote/paid)

## SDK-first Architecture: Evidence → Derived State → Derived Policy → Writer

We use Agent SDK primitives:

- Structured outputs (`AGENTS SDK Docs/structured-outputs.md`)
- Hooks (`AGENTS SDK Docs/hooks.md`)
- Skills (`AGENTS SDK Docs/skills.md`)
- MCP resource access (`AGENTS SDK Docs/mcp.md`)
- Sessions and resumption (`AGENTS SDK Docs/sessions.md`)

## Already implemented (do not redo)

1) **Continuous summary refresh after every turn**
   - `generateDealSummary()` + `updateDealSummary()` run on `Stop` hook.
   - `deal_summary` is therefore authoritative and up to date for derived state.
2) **Streaming input mode for MCP**
   - `src/runtime/salesAgent.ts` uses an async generator prompt to satisfy MCP tool requirements.

### A) Evidence aggregation (code, deterministic)

Each inbound event:

1) Use **fresh `deal_summary`** as the primary evidence source (already refreshed on `Stop` hook after each turn).
2) Fetch deal properties needed for commercial actions + enrichment (existing fields like `sw_primary_pain`, `agents_required`, etc.).
3) Fetch commercial artifacts:
   - line items count / existence
   - invoice id/link/status (if any)

Note: We do **not** re-parse raw engagement bodies unless `deal_summary` is missing or stale.

### B) Derived commitment state (StructuredOutput, semantic)

Add a new schema in `src/runtime/schemas.ts` (e.g. `DERIVED_STATE_SCHEMA`) that returns:

- `commitmentCurrent` (1–10)
- `commitmentEvidence` (short bullets w/ timestamps or snippets)
- `pricingIntent` (`explicit` | `implied` | `none`)
- `buyerIntent` (enum: `product_question` | `pricing_question` | `objection` | `implementation` | `stop_contact` | `unknown`)
- `fatigueSignals` (boolean + rationale)
- `recentAsks` (last 1–3 asks we made, extracted from `deal_summary` latest comms; used to avoid repeats)
- `unknowns` (what’s missing to advance the *next* commitment)

Implementation detail:

- This runs as a restricted subagent (tools: `StructuredOutput` only; it receives evidence text in the prompt).
- Because cost/latency is irrelevant, we can include richer engagement context and require strong evidence before advancing a commitment.

### C) Derived “what to do next” policy (StructuredOutput)

Add another schema in `src/runtime/schemas.ts` (e.g. `NEXT_ACTION_SCHEMA`) that returns:

- `mustAnswer` (what to address right now)
- `nextCommitment` (1–10)
- `minimalAsk` (one purpose-framed question OR a CTA, chosen semantically)
- `askStyle` (`question` | `cta` | `nurture` | `close`)
- `avoidTopics` (things not to ask again / do not rehash)
- `pricingDirective` (if pricing intent present: which SKU prices to quote, pulled from catalog)

Policy rules (first principles):

- **Answer-first**: mustAnswer precedes any ask.
- **One-step steering**: always steer, but with minimal friction.
- **No repeat asks**: do not ask for anything in `recentAsks` unless the buyer contradicted or explicitly reopened it.
- **Nurture on fatigue**: if fatigueSignals true or they ignored prior asks, use `askStyle=nurture` (answer + value + optional CTA).
- **Stop-contact**: `askStyle=close` and 0 questions.

### D) Writer (Skills + hooks)

Writer composes the email using `draft-reply` skill:

- Always answers intent first.
- Includes the policy’s steering move (question/CTA/nurture/close).
- Uses 0–3 question cap (structural).

We keep the structured draft format (`bodyParts`) because it gives us a control surface for hooks.

## Deterministic pricing (MCP resource-first)

Canonical catalog: `data/zendesk-products.json`.

Preferred approach:

- Expose the catalog as an MCP resource and allow `mcp__list_resources` / `mcp__read_resource`.
- For pricing intent (explicit or implied), policy step must read catalog and quote exact per-agent pricing (no guessing).
- Add a **PreToolUse hook** that denies quoting if pricing intent exists but the catalog resource was not read in this turn.

Fallback (if resource exposure isn’t feasible):

- Add thin MCP tools in `src/tools/mcp.ts` that return the catalog pricing in a strict schema.

## Hook enforcement (outcomes, not scripts)

We use hooks to guarantee UX and consistency without overprompting:

1) `UserPromptSubmit` hook:
   - Inject the latest derived state + next action policy into the prompt so the writer always sees:
     - current commitment, next commitment, minimal ask, and “avoid repeats.”
2) `PreToolUse` hook on `mcp__sales-crm__crm_logEmailDraft`:
   - Enforce: steering move exists (question or CTA) unless stop-contact.
   - Enforce: no repeated question content when it matches `recentAsks` (best-effort semantic match).
   - Maintain async-only sanitization and 0–3 cap.
   - Enforce: if pricing intent is present, catalog must have been read this turn before quoting.
3) `PreCompact` hook:
   - Before compaction, re-inject the latest derived state summary so sessions don’t lose commitment context.

## Hard checks & advancement timing (blocking rules)

We allow semantic inference, but **stage advancement only happens after**:
1) The relevant evidence is persisted in HubSpot fields (where applicable), and
2) The reply that contains the ask/answer has been drafted/logged.

Hard checks per stage:

- **Admitted Pain / Gap** → `sw_primary_pain` must be set.
- **Defined Scope & Impact** → `key_challenges` AND `ticket_volume_per_month` must be set.
- **Established Timeline** → `timeline_for_change` must be set.
- **Confirmed Agent Count** → `agents_required` must be set.
- **Confirmed Support Channels** → `support_channels` must be set.
- **Pricing Discussed** → pricing intent detected AND outbound draft includes catalog pricing AND catalog resource read this turn.
- **Selected Tier** → line items exist on the deal.
- **Quote Sent** → invoice exists AND outbound draft includes the invoice URL.
- **Paid** → invoice status is paid in HubSpot.

If a check fails, inject feedback to the model (via hooks/system message):  
“BLOCKED: cannot advance to \<stage\> because \<missing requirement\>.”

## Stage projection + idempotency

Since HubSpot stages mirror commitments:

- After deriving `commitmentCurrent`, update `dealstage` to match if it’s behind (monotonic forward-only).
- Do not regress stage; if contradiction occurs, **update fields with latest evidence** and use nurture + reconfirm minimal asks rather than moving backward.
- Idempotency is derived from HubSpot artifacts:
  - Line items for Selected Tier
  - Invoice association + URL for Quote Sent
  - Invoice status for Paid

## Skills changes (high leverage)

Update existing skills to align with derived-state operation:

- `.claude/skills/draft-reply/SKILL.md`
  - Make “policy-guided writer”: answer-first, then minimal steering move.
  - Remove any implied “fill questions array” requirement.
- `.claude/skills/discovery/SKILL.md`
  - Reframe as “advance next commitment with minimal ask,” not “collect BANT.”
- `.claude/skills/plan-recommendation/SKILL.md`
  - Only used once we have sufficient evidence (typically after pain + scope and/or when buyer asks “which plan?”).

## Evaluation updates

Revise `src/eval/evaluator.ts` scoring to align with commitments:

- Commitments advanced per turn (primary)
- Redundant ask rate (strong negative)
- Fatigue handling (nurture instead of interrogate)
- Pricing correctness when asked (must match catalog)
- Time-to-tier-selection, time-to-quote-sent, time-to-close (lagging)

## Verification checklist (stage‑by‑stage)

Use this checklist to validate each commitment advancement before we allow stage updates.

1) **Expressed Commercial Intent** (`2130118129`)
   - Evidence: inbound/reply indicates interest.
   - Verify: new inbound/reply event exists.

2) **Admitted Pain / Gap** (`2182866374`)
   - Evidence: pain statement in `deal_summary`.
   - Verify: `sw_primary_pain` set in HubSpot before stage advance.

3) **Defined Scope & Impact** (`2185655765`)
   - Evidence: challenges + volume in `deal_summary`.
   - Verify: `key_challenges` AND `ticket_volume_per_month` set.

4) **Established Timeline** (`2388431315`)
   - Evidence: timeline in `deal_summary`.
   - Verify: `timeline_for_change` set (ms timestamp).

5) **Confirmed Agent Count** (`2390248940`)
   - Evidence: agent count in `deal_summary`.
   - Verify: `agents_required` set.

6) **Confirmed Support Channels** (`2388431316`)
   - Evidence: channels in `deal_summary`.
   - Verify: `support_channels` set (normalized values).

7) **Pricing Discussed** (`2388431317`)
   - Evidence: pricing intent (explicit or implied) in derived state.
   - Verify:
     - Catalog resource read this turn (`mcp__read_resource`),
     - Outbound draft contains catalog pricing (per‑agent price or SKU price),
     - Reply was logged via `crm_logEmailDraft`.

8) **Selected Tier** (`2387718587`)
   - Evidence: buyer agreement on tier in `deal_summary`.
   - Verify: line items exist on the deal (HubSpot line item association count > 0).

9) **Quote Sent** (`contractsent`)
   - Evidence: invoice created + URL included in outbound reply.
   - Verify:
     - Invoice exists + link retrieved from HubSpot,
     - Outbound draft includes invoice URL,
     - Reply was logged via `crm_logEmailDraft`.

10) **Paid** (`closedwon`)
    - Evidence: invoice status paid.
    - Verify: invoice status from HubSpot is “paid” (or equivalent `hs_invoice_status`).

**Closed Lost** (`closedlost`)
   - Evidence: semantic “not interested / stop contact / not a fit”.
   - Verify: closing email sent first (unless spam/abuse), then mark lost.

## End‑to‑end validation (required)

Run the full E2E protocol after implementing commitment‑based progression:

1) Automated regression:
   - `bun eval -- --count 20 --concurrency 5`
   - `bun eval:score -- --run-id <RUN_ID>`

2) Manual interactive test (per `TESTING_PROTOCOL.md`):
   - Execute the step‑by‑step manual conversation flow.
   - Verify:
     - Stage only advances after required hard checks pass.
     - Pricing Discussed only advances after catalog read + pricing quoted.
     - Selected Tier advances only after line items exist.
     - Quote Sent advances only after invoice exists + URL in reply.
     - Paid advances only after invoice status is paid.
     - No stage regression on contradictions (fields update, stage stays).

## Implementation sequence (rebuild order)

1) Add new HubSpot stages + update `src/config/dealStage.ts` to the stage IDs/order/names above.
2) Implement derived state schema + subagent (StructuredOutput).
3) Implement next action policy schema + subagent (StructuredOutput).
4) Add MCP resource access for pricing catalog and enforce pricing reads on pricing intent.
5) Add hooks: `UserPromptSubmit`, `PreToolUse` (draft enforcement), `PreCompact`.
6) Update skills and system prompt to become “policy-guided writer” (thin, stable).
7) Update eval harness and run regressions (`bun eval`, `bun eval:score`).
 
