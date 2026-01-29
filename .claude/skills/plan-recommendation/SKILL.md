---
name: plan-recommendation
description: Recommend a Zendesk plan + add-ons only after commitments are met or the buyer explicitly asks which plan/tier to buy.
---

# Plan Recommendation Skill (Commitment-Gated)

Use this skill to translate validated discovery inputs into a recommended plan + add-ons and SKU list.
Use only when the next-action policy indicates plan selection or explicit/implied pricing intent.

## Inputs to Collect (Only if missing and blocking selection)
- Agent count (full + light)
- Channels required (capture full list)
- Ticket volume and seasonality
- SLAs and compliance requirements
- Help center maturity and deflection goals
- Reporting needs
- Integrations and security requirements

## Decision Guide

### Plan Family
- **Suite only**: multi-channel + help center + reporting (v1 scope)

### Add-on Triggers
- **AI**: deflection, triage, summaries, agent assist
- **WFM / QA / WEM**: large teams, QA requirements
- **Security (ADPP)**: enterprise security reviews
- **Capacity**: high volume API, storage, WhatsApp numbers
- **Usage**: voice credits, Sunshine MAU/notifications

## Sources of Truth
- SKU list: Zendesk pricing catalog MCP resource (source of truth)
- Functionality verification: **zendesk-kb-search** (if needed)

## Allowed SKUs (current)
Plans:
- ZD-SUITE-TEAM
- ZD-SUITE-GROWTH
- ZD-SUITE-PROFESSIONAL
- ZD-SUITE-ENTERPRISE
- ZD-SUITE-ENTERPRISE-PLUS
- ZD-SUPPORT-TEAM
- ZD-SUPPORT-PROFESSIONAL
- ZD-SUPPORT-ENTERPRISE
- ZD-SELL-TEAM
- ZD-SELL-GROWTH
- ZD-SELL-PROFESSIONAL
- ZD-SELL-ENTERPRISE

Add-ons:
- ZD-ADDON-AI-GENERATIVE-SEARCH-EXTENDER
- ZD-ADDON-AI-COPILOT
- ZD-ADDON-AI-AGENTS-ADVANCED
- ZD-ADDON-SECURITY-ADPP
- ZD-ADDON-OPS-AGENT-MONTHS
- ZD-ADDON-OPS-COLLABORATION
- ZD-ADDON-OPS-PREMIUM-SANDBOX
- ZD-ADDON-CHANNEL-GUIDE
- ZD-ADDON-CHANNEL-CHAT-MESSAGING
- ZD-ADDON-CHANNEL-EXPLORE
- ZD-ADDON-WORKFORCE-WFM
- ZD-ADDON-WORKFORCE-QA
- ZD-ADDON-WORKFORCE-WEM
- ZD-ADDON-CAPACITY-LIGHT-AGENTS
- ZD-ADDON-CAPACITY-WHATSAPP-NUMBERS
- ZD-ADDON-CAPACITY-STORAGE
- ZD-ADDON-CAPACITY-HIGH-VOLUME-API
- ZD-ADDON-USAGE-VOICE-CREDITS
- ZD-ADDON-USAGE-SUNSHINE-MAU
- ZD-ADDON-USAGE-SUNSHINE-NOTIFICATIONS
- ZD-ADDON-USAGE-AUTOMATED-RESOLUTIONS

## Output Format
Return a concise recommendation with SKUs and quantities, for example:

```
Recommended Plan: ZD-SUITE-GROWTH (10 agents)
Add-ons: ZD-ADDON-AI-COPILOT (10 agents), ZD-ADDON-WORKFORCE-QA (10 agents)
Notes: Needs SSO + security review; enterprise add-ons may be required.
```

## Rules
- If a feature question is unresolved, call **zendesk-kb-search** first.
- Keep estimates labeled as “starting at” when required.
- Recommend the plan that best solves the pain points uncovered in discovery, not a default tier.
- Use only SKUs that exist in `data/zendesk-products.json`. Do not add implementation/service SKUs.
 - If commitment prerequisites are missing (pain, scope/impact, timeline, agent count, channels), do NOT recommend a plan; return the missing item(s) and a single minimal ask instead.
