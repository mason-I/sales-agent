# sales-agent

Autonomous, async-first sales agent for Zendesk built on the Claude Agent SDK. It integrates with HubSpot CRM to qualify leads, answer product questions, and move deals through stage gates without human escalation.

Core capabilities:
- Handles inbound, reply-to-existing, and stale-deal events
- Uses CRM tools to read/update deals, log email drafts, and add notes/tasks
- Enforces stage-gate requirements and captures missing qualification data
- Leverages subagents for KB research, email drafting, and services quoting
- Includes an evaluation harness for simulated conversations
