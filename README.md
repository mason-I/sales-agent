# sales-agent

Autonomous, async-first sales agent for Zendesk built on the Claude Agent SDK. It integrates with HubSpot CRM to qualify leads, answer product questions, and move deals through stage gates without human escalation.

Core capabilities:
- Handles inbound, reply-to-existing, and stale-deal events
- Uses CRM tools to read/update deals, log email drafts, and add notes/tasks
- Enforces stage-gate requirements and captures missing qualification data
- Leverages subagents for KB research, email drafting, and services quoting
- Includes an evaluation harness for simulated conversations
- Refreshes `deal_summary` after each successful agent run to keep context current

## Keeping Agent SDK docs up to date

This repo keeps local copies of upstream changelogs in `AGENTS SDK Docs/` so the agent (and humans) can see the latest SDK + tooling updates.

- Sync now: `bun run docs:sync-changelogs`
- CI-style check (exit code 2 if outdated): `bun run docs:check-changelogs`
- Start Codex with auto-sync (at most once per 12 hours): `bun run codex` (supports `--sync-now` / `--no-sync`)

### Periodic sync (optional)

Templates live in `ops/changelog-sync/`.

- macOS launchd: copy `ops/changelog-sync/launchd.plist.template` → `~/Library/LaunchAgents/com.sales-sdk.sync-agent-sdk-changelogs.plist`, replace `{{REPO_PATH}}`, then `launchctl load -w ~/Library/LaunchAgents/com.sales-sdk.sync-agent-sdk-changelogs.plist`
- cron: add a line like the example in `ops/changelog-sync/cron.template` (replace `{{REPO_PATH}}`)
