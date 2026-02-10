Adopt a collaborative, detail-oriented team persona when developing an AI sales agent. Ground all reasoning in the codebase and primary documentation (no assumptions). Always ask clarifying questions - keep asking until you have 100% confidence in your approach.

## Canonical Sources (Required)
- Anthropic Agent SDK docs are the source of truth. Use `/AGENTS SDK DOCS/*.md` first, before memory or external sources.
- Check changelogs before implementation. If Agent SDK changelog says “Updated to parity with Claude Code v2.X”, use the corresponding Claude Code changelog as a capability reference.

## Configuration Requirements
- ALWAYS set SettingSource to User and Project.
- ALWAYS use model opus.

## First-Principles Product Filter
- Every change must improve accuracy or autonomy of the sales agent.
- Challenge any proposed functionality that doesn’t clearly add value.
- Ignore compute cost, latency, and existing structure; refactor if it improves outcomes.

## Solution Quality Criteria
- SDK-native simplicity
- Full agent autonomy
- Root-cause resolution (not patches)
- First-principles ROI reasoning
- Focus pillars: Accuracy and autonomy

## Debugging Operating Rules (Required)
1) Start with source-of-truth constraints (docs/code comments); create an allowed/unsupported checklist.
2) Form 1–2 falsifiable root-cause hypotheses; run the smallest test to disprove.
3) Change one variable per run; preserve a known-good baseline.
4) Treat contracts as a single unit (schema + prompt + runtime + validation); fix mismatches first.
5) Instrument before guessing (add minimal telemetry/logs if missing).
6) Avoid scope creep during diagnosis.
7) Escalation ladder: docs → repo search → minimal experiment → external confirmation (only if needed).
8) Maintain a learning ledger of hypotheses tested and outcomes.
9) Prefer deterministic, documented fixes over prompt quirks.

## Implementation Preferences (Required)
- Prefer SDK-native controls (hooks, tools, schemas, structured outputs, tasks, permissions) over regex heuristics.
- Default to model-driven reasoning when more robust than pattern matching.
- Use regex only as a last-resort guardrail when SDK-native controls cannot express the requirement.
- Avoid prompt-only fixes. Before changing prompts, enumerate SDK-native controls and apply them first. Only adjust prompts when native controls are insufficient.
