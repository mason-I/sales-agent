# E2E Sales Agent Testing Protocol

Comprehensive testing protocol for the sales agent, supporting both automated evaluation runs and manual interactive testing.

## Overview

This protocol covers two complementary approaches to testing the sales pipeline:

1. **Automated Evaluation** - AI-simulated customers with personas, parallel execution, reproducible scenarios
2. **Manual Interactive Testing** - Human-controlled conversations for exploratory testing and debugging

Both approaches test the full pipeline: initial inbound → qualification → deal progression → HubSpot verification.

---

## Testing Approaches

### Automated Evaluation (Recommended for Regression Testing)

Run multiple AI-simulated conversations in parallel with diverse customer personas:

```bash
# Single conversation for quick testing
bun eval -- --count 1 --concurrency 1

# 10 conversations with 3 running in parallel
bun eval -- --count 10 --concurrency 3

# Full regression suite (20 conversations, 5 parallel)
bun eval -- --count 20 --concurrency 5

# Verbose run (streams live agent/tool activity to console)
bun eval -- --count 1 --concurrency 1 --verbose

# Cap turns to avoid long-running evals
bun eval -- --count 1 --concurrency 1 --max-turns 8
```

**Available Personas:**
- `vague-explorer` - Early stage, minimal disclosure, needs nurturing
- `informed-buyer` - Knows what they want, asks specific questions
- `budget-blocker` - Very price-sensitive, needs ROI justification
- `technical-evaluator` - Deep capability questions, needs KB research
- `urgent-buyer` - Short timeline, high intent, ready to move
- `time-waster` - Asks questions but never commits
- `ghosting-prospect` - Stops responding mid-conversation

**Output:** Conversations saved to `data/eval-runs/{RUN_ID}/conversations/*.jsonl`

**Important:** Eval personas must use `.com` domains (e.g. `@example.com`). Avoid `.local` or other non-.com domains, which HubSpot rejects.

**Next Steps:**
```bash
# Score the results
bun eval:score -- --run-id {RUN_ID}

# Clean up test data from HubSpot
bun eval:cleanup -- --run-id {RUN_ID}
```

**When to Use:**
- Regression testing after code changes
- Performance baseline measurements
- Testing specific persona behaviors at scale
- CI/CD integration

---

### Manual Interactive Testing (For Deep Analysis)

Human plays the customer role for real-time observation and adaptive behavior testing.

**When to Use:**
- Debugging specific failure scenarios
- Exploratory testing of new features
- Deep analysis of agent decision-making
- Testing edge cases not covered by personas

---

## Quick Reference

### Automated Eval Commands

```bash
# Single test run
bun eval -- --count 1 --concurrency 1

# Full suite (20 conversations, 5 parallel)
bun eval -- --count 20 --concurrency 5

# Score results
bun eval:score -- --run-id {RUN_ID}

# Cleanup HubSpot data
bun eval:cleanup -- --run-id {RUN_ID}

# View conversation
cat data/eval-runs/{RUN_ID}/conversations/000.jsonl | jq .
```

### Manual Testing Commands

```bash
# Single turn
echo '{...}' | bun dev

# View run notes
cat data/run-notes/$(date +%Y-%m-%d).jsonl | jq .
```

---

## Manual Testing Protocol

The following steps describe the manual interactive testing workflow.

### Step 1: Generate Test Identity

Create a unique persona on-the-fly for each manual test run:

| Field | Example |
|-------|---------|
| Name | Riley Morgan |
| Email | `riley.morgan-{timestamp}@example.com` |
| Company | Apex Solutions Ltd |
| Role | Director of Operations |

Use current Unix timestamp to ensure uniqueness (avoid `@test.local` - use `@example.com` for HubSpot compatibility).

---

### Step 2: Send Initial Inquiry (Turn 1)

Invoke the sales agent with a vague initial email:

```bash
echo '{
  "source": "new_inbound",
  "type": "email",
  "fromEmail": "riley.morgan-1736576890@example.com",
  "fromName": "Riley Morgan",
  "subject": "Quick question",
  "body": "Hi, I came across your platform and wanted to learn more. Can you help?"
}' | bun dev
```

**Goal**: Be intentionally vague to test agent's discovery behavior.

---

### Step 3: Observe & Adapt (Turns 2-7)

### Monitor Console Output
- Watch for `[AGENT→TOOL]` logs (tool invocations)
- Note draft email content quality
- Track deal stage changes
- Check for autonomous decision logging (crm_addDealNote)

### Decide Next Response
Based on agent behavior:
- **Reveal information gradually** (company, role, pain points)
- **Withhold strategically** (budget, timeline) to test qualification
- **Ask challenging questions** (pricing, capabilities, deadlines)
- **Be evasive occasionally** to test persistence

### Challenge Examples
| Agent Asks | Challenge Response |
|------------|-------------------|
| "What's your budget?" | "We're still figuring that out" |
| "What's your timeline?" | "No rush, just exploring" |
| "What problem are you solving?" | "General efficiency improvements" |

### Continue Loop
```bash
echo '{
  "source": "reply_to_existing",
  "type": "email",
  "fromEmail": "riley.morgan-1736576890@example.com",
  "fromName": "Riley Morgan",
  "dealId": "<DEAL_ID_FROM_PREVIOUS>",
  "subject": "Re: Quick question",
  "body": "<ADAPTIVE_RESPONSE>"
}' | bun dev
```

---

### Step 4: HubSpot Verification

After 5-7 turns, verify CRM state using existing HubSpot API functions:

### Verify Contact Created
```typescript
import { getContactByEmail } from "./src/lib/hubspot";
const contact = await getContactByEmail("riley.morgan-1736576890@example.com");
```

### Verify Deal & Stage
```typescript
import { fetchDealProperties } from "./src/lib/hubspot";
const deal = await fetchDealProperties(dealId, ["dealname", "dealstage", "deal_summary"]);
```

### Verify Emails Logged
```typescript
import { fetchDealEngagements } from "./src/lib/hubspot";
const engagements = await fetchDealEngagements(dealId);
// Count should match number of turns
```

---

## Step 5: Analyze Results

### Automated Eval Results

After each eval run, conversation transcripts are saved to `data/eval-runs/{RUN_ID}/conversations/*.jsonl`:

```bash
# View summary of a specific run
cat data/eval-runs/{RUN_ID}/conversations/000.jsonl | jq '{
  persona: .persona.id,
  turns: (.turns | length),
  outcome: .outcome,
  emails: [.turns[] | .agentResponse[0:100]]
}'

# Check all outbound emails were logged
cat data/eval-runs/{RUN_ID}/conversations/000.jsonl | jq '.turns[] | {
  turn: .turnNumber,
  hasEmail: (.agentResponse | length > 0)
}'

# View conversation outcomes distribution
ls data/eval-runs/{RUN_ID}/conversations/*.jsonl | xargs cat | jq -s '
  group_by(.outcome) | map({outcome: .[0].outcome, count: length})
'
```

**Key Fields in Eval Output:**

| Field | Purpose |
|-------|---------|
| `persona` | Customer persona details and behaviors |
| `turns` | Array of conversation turns with customer & agent messages |
| `outcome` | Final result: `qualified`, `lost`, `stalled`, `timeout` |
| `entities` | Created HubSpot objects (contactId, dealId, taskIds) |
| `totalDurationMs` | End-to-end conversation duration |

### Manual Testing Run Notes

For manual testing via `bun dev`, detailed logs are written to `data/run-notes/YYYY-MM-DD.jsonl`:

```bash
# View latest run notes
cat data/run-notes/$(date +%Y-%m-%d).jsonl | jq .

# Filter to failed runs
cat data/run-notes/*.jsonl | jq 'select(.executionSummary.success == false)'

# Extract tool usage patterns
cat data/run-notes/*.jsonl | jq '.toolUsage'
```

**Key Fields in Run Notes:**

| Field | Purpose |
|-------|---------|
| `planSummary` | Intent, goal, and task breakdown |
| `judgeSummary` | Pass/fail, score, violation codes |
| `executionSummary` | Success status, executed tasks, errors |
| `toolUsage` | Tool calls, failures, permission denials |

---

## Success Criteria

### Automated Eval

| Check | Expected |
|-------|----------|
| Contact created | Email matches generated persona |
| Deal created | Associated with contact |
| Emails logged | Count = number of conversation turns (verify via engagements) |
| Unique responses | Each turn has different agent response content |
| Proper outcomes | Conversations end with valid outcome (qualified/lost/stalled/timeout) |
| No infinite loops | Max turns respected, stop hook enforcement working |
| Autonomous decisions logged | Deal notes created for significant decisions (declined discounts, closed deals) |

**Verification Commands:**
```bash
# Check email logging enforcement
cat data/eval-runs/{RUN_ID}/conversations/000.jsonl | jq '[.turns[] | {
  turn: .turnNumber,
  hasEmail: (.agentResponse | length > 0),
  length: (.agentResponse | length)
}]'

# Should show increasing engagement counts (2, 4, 6, 8...)
# indicating new outbound emails each turn
```

### Manual Testing

| Check | Expected |
|-------|----------|
| Contact created | Email matches test identity |
| Deal created | Associated with contact |
| Stage progression | Moved from Qualification → next stage (if qualified) |
| Emails logged | Count = number of conversation turns |
| Properties populated | Company, timeline, budget (if revealed) |
| Autonomous decisions | Deal notes created for declined discounts, closed deals, etc. |
| Run notes logged | Entry exists in `data/run-notes/` |

---

## Cleanup

### Automated Eval Cleanup

After reviewing results, clean up test data from HubSpot:

```bash
# Clean up a specific run
bun eval:cleanup -- --run-id {RUN_ID}

# This deletes: contacts, deals, tasks, emails, notes
# Conversation transcripts in data/eval-runs/ are preserved
```

### Manual Test Cleanup

For manual tests, you'll need to manually archive/delete test contacts and deals from HubSpot UI or use the API directly.

---

## Notes

- **Automated eval uses AI customers** - Consistent, reproducible, scalable
- **Manual testing uses human customer** - Adaptive, exploratory, deep analysis
- **Unique identities per run** - Prevents data collision (timestamp-based emails)
- **Stop Hook enforcement** - Agent cannot complete without sending email responses
- **Uses existing HubSpot functions** - No wrapper scripts needed
