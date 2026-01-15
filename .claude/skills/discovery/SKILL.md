---
name: discovery
description: Use when conducting discovery to understand prospect pain points, challenges, and requirements.
---

# Discovery Skill (Zendesk Emulation)

**Core Principle:** Diagnose before prescribing. Never pitch until you fully understand the support model and constraints.
**SMB Focus (<500 employees):** Keep discovery lightweight and practical. Assume lean teams, limited admin time, and sensitivity to complexity. Emphasize time-to-value and operational fit.

## When to Use

- Use when missing context is blocking meaningful progression
- Early-stage inquiries where you need to understand support stack and volume
- Follow-ups where answers are incomplete or inconsistent
- Before drafting recommendations when plan/add-on fit is unclear

---

## Sales Process Overview (Context)

1) **Discovery** → understand needs, size the system
2) **Qualification** → confirm BANT + process constraints
3) **Recommendation** → map needs → plan + add-ons + quote

---

## 1. SPIN Framework (Execute in Order)

### Situation → Problem → Implication → Need-Payoff

| Phase | Purpose | Example Questions |
|-------|---------|-------------------|
| **Situation** | Establish current state | "What does your support stack look like today?" / "How many agents and channels are you supporting?" |
| **Problem** | Uncover pain and friction | "Where do tickets get stuck?" / "Which workflows are most manual?" |
| **Implication** | Amplify cost of inaction | "What happens when SLAs are missed?" / "How does this impact CSAT or renewals?" |
| **Need-Payoff** | Connect to solution value | "If you could reduce handle time by 20%, what would that unlock?" |

**Rule:** Don't over-ask Situation questions. Get the facts, then move to problems.

---

## 2. Must-Capture Inputs (Discovery Essentials)

- **Agents:** full + light agents (current + target)
- **Channels:** full list of support channels in use (capture all, not just primary)
- **Ticket volume:** weekly/monthly, seasonality
- **SLAs:** response/resolution targets, compliance requirements
- **Help center maturity:** existing KB, deflection goals
- **Reporting needs:** dashboards, exports, executive KPIs
- **Security/compliance:** SSO, audit logs, data residency, DPA requirements
- **Integrations:** CRM, data warehouse, telephony, custom apps
- **Timeline + procurement:** deadlines, stakeholders, review process
- **Team constraints:** admin bandwidth, workflows that must be preserved

---

## 3. BANT Qualification

Extract these fields from every discovery conversation:

| Field | Signal to Find | Question Strategy |
|-------|----------------|-------------------|
| `primary_pain` | Main problem driving the initiative | "What prompted you to reach out now?" |
| `key_challenges` | Specific obstacles | "What makes this difficult?" |
| `desired_outcomes` | Definition of success | "What does success look like?" |
| `budget` | Financial capacity | **Anchor:** "What is solving [problem] worth to you?" (Never ask directly) |
| `timeline` | Urgency and deadline | "When do you need this operational?" |
| `authority` | Decision-making power | "Who else is involved in the decision?" |

**SMB note:** Expect fewer stakeholders and faster timelines; keep BANT questions minimal.

---

## 4. Discovery Questions by Area

### Support Operations
- "How many tickets per week/month do you handle?"
- "Which support channels are critical for your team?"
- "Do you have SLAs or compliance requirements?"

### Help Center & Deflection
- "Do you currently have a help center or KB?"
- "What deflection targets matter most?"

### Reporting & Insights
- "Which KPIs matter most (CSAT, FRT, backlog)?"
- "Who needs dashboards or exports?"

### Security & Compliance
- "Do you require SSO, audit logs, or data residency?"
- "Any security review or DPA requirements?"

### Integrations & Stack
- "Which systems must integrate (CRM, telephony, data warehouse)?"

---

## 5. Universal Openers

**For new inquiries:**
- "What prompted you to reach out now?"
- "If you could wave a magic wand, what would be different?"

**For follow-ups:**
- "You mentioned [pain]. Has anything changed?"
- "Where does that stand now?"

---

## 6. Implication Questions (Amplify Urgency)

After uncovering a problem, dig into consequences:

- "What happens downstream when [problem] occurs?"
- "How does this affect renewal risk or CSAT?"
- "What is the cost of waiting 3–6 months?"

---

## 7. Engagement Signals

**High engagement:**
- Detailed answers, internal metrics shared, clear stakeholders

**Low engagement:**
- Vague responses, no timelines, deflecting questions

---

## 8. Recommendation Context (For Handoff Only)

Do **not** recommend yet. Capture signals for the plan-recommendation skill:

- **Plan family:** Suite only (current scope)
- **Add-on triggers:** AI, security, WFM/QA/WEM, capacity (API/storage/WhatsApp), usage (voice/MAU/notifications)
- **Pricing + SKUs:** use `data/zendesk-products.json` for downstream line items

---

## 9. Tooling Rules

- **web_search**: prospect/company research (who they are, domain validation).
- **zendesk-kb-search**: product functionality verification.
  - If KB search cannot answer, return **NOT_FOUND** and ask follow-up questions.

---

## 10. Execution Rules

1. **Gap Assessment (Not Mandatory):** Check what BANT fields are missing, but do NOT automatically ask. If appropriate, ask 0–1 targeted question.
2. **Persist Findings:** As soon as you capture a missing field (e.g., `sw_primary_pain`, `key_challenges`), you MUST call `crm_updateDealProperties` to save it to HubSpot.
3. **Depth Over Breadth:** Follow a thread (Situation → Problem → Implication) before switching topics.
4. **No Prescribing:** Do not suggest solutions until you understand pain + scale + constraints.
5. **Summarize Understanding:** Confirm your understanding before recommending plans/add-ons.
6. **Async-only:** Do not suggest calls or meetings. If prospect requests a call, politely decline and redirect to async.
7. **Handle blockers autonomously:** For phone-only requests, politely decline and redirect to async. For legal/compliance questions, answer from KB only - if NOT_FOUND, admit uncertainty and continue. For pricing demands (discounts), decline firmly - we do not offer discounts.

If objections or competitor mentions arise, use the **objection-handling** skill.

## Output Format (for internal tasks)
Provide:
1) **Concise summary** of known facts
2) **Missing gaps** (bulleted)
3) **Questions (max 1)** — short, answerable, and prioritized (0 is valid)
