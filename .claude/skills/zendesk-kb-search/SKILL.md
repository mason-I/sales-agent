---
name: zendesk-kb-search
description: Use when you need to verify Zendesk product functionality or answer Zendesk how-to questions using Zendesk-owned sources. Must return NOT_FOUND if no grounded answer is found. Do not use for prospect/company research.
required-tools:
  - kb_searchZendesk
---

# Zendesk KB Search (Parallel.ai)

Use this skill to answer Zendesk product questions and verify functionality by searching Zendesk-owned documentation. This is **internal knowledge retrieval only**; use web search separately for prospect/company research.

## When to Use
- Zendesk “how-to” questions
- Feature behavior/limits
- Plan-related clarifications (where support KB is authoritative)
- Any Zendesk functionality that may change over time

## Rules
- **Only** use Zendesk-owned domains (the script enforces this).
- If you cannot find a grounded answer, you **must** return `NOT_FOUND`.
- Do not guess or fabricate details.

## Run the Script

Call the tool `kb_searchZendesk` with:
```
{
  "objective": "How do you set up workflows in Zendesk?",
  "maxResults": 10
}
```

### Output Contract (JSON)
- `status`: `"FOUND"` or `"NOT_FOUND"`
- `answer`: string or null
- `steps`: string[] (optional)
- `plan_dependencies`: string[] (optional)
- `links`: string[] (source URLs)
- `confidence`: `"low" | "medium" | "high"`
- `reason`: string (required when `status = "NOT_FOUND"`)

If the script returns `NOT_FOUND`, pass that status along and ask follow-up questions instead of guessing.
