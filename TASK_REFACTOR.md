# Task Refactor Plan (SDK Tasks Primary, HubSpot Mirror)

## Goal (First Principles)
- SDK Tasks are the source of truth for agent planning and execution.
- HubSpot Tasks are a read-only mirror so humans can see what the agent did.
- Preserve SDK summaries (plan/execution/tool usage) and add task events.

## What Changes
- Replace TodoWrite usage with SDK Tasks in prompts and allowed tools.
- Mirror SDK task lifecycle events into HubSpot tasks (in_progress, completed).
- Remove local workitem dependency schema/logic once SDK Tasks are confirmed to cover it.
- Add per-deal task list scoping via `CLAUDE_CODE_TASK_LIST_ID`.

## What Gets Better
- Dependency handling is native to the SDK task system (less prompt-level orchestration).
- Cross-session continuity with per-deal task lists.
- Human audit trail in HubSpot without affecting agent execution.

## What Gets Worse / Risks
- HubSpot noise if low-value tasks are mirrored.
- HubSpot does not model dependencies; we must encode context in task body.
- HubSpot API failure should not block agent execution (must be non-blocking).

## Non-Goals
- HubSpot tasks should not drive agent behavior.
- No reverse sync from HubSpot to SDK Tasks.

---

## Phased Implementation Plan

### Phase 0 — Confirm SDK Task Event Surface
Objective: Verify how SDK Tasks emit lifecycle events and dependency info.

Actions:
- Confirm task creation and status change events are exposed in message stream.
- Verify whether dependency metadata is visible or internal-only.

Exit criteria:
- Clear event schema for task lifecycle data (ID, title/summary, status, deps if available).

---

### Phase 1 — Replace TodoWrite
Objective: Use SDK Tasks as primary task system.

Changes:
- Update `src/runtime/systemPrompt.ts` to instruct SDK Tasks for multi-step work.
- Remove `TodoWrite` from `ALLOWED_TOOLS` in `src/runtime/salesAgent.ts`.
- Ensure `Task` remains in allowed tools (for subagents and task functionality).

---

### Phase 2 — HubSpot Mirror (in_progress + completed only)
Objective: Write-through mirror of SDK tasks into HubSpot tasks.

Rules:
- Mirror only `in_progress` and `completed` status transitions.
- Do not mirror `pending` or internal-only tasks.
- Mirroring must be non-blocking (SDK task flow continues if HubSpot call fails).

HubSpot task format (body tag):
```
SDK_TASK_ID:<id>: <short summary>
```

Behavior:
- On SDK task → `in_progress`:
  - Create HubSpot task if not found.
  - If found, update status to NOT_STARTED or IN_PROGRESS (depending on HubSpot API semantics).
- On SDK task → `completed`:
  - Update HubSpot task status to COMPLETED.
  - If not found, create and immediately mark completed.

Lookup approach:
- Fetch HubSpot tasks for the deal.
- Match by `SDK_TASK_ID:<id>` tag in task body.
- No local mapping files.

---

### Phase 3 — Inline Validation (No Files)
Objective: Verify mirroring without writing new files.

Checks (inline):
- Fetch deal task IDs via `fetchDealTaskIds`.
- Load tasks and confirm each SDK task ID seen in this run exists in HubSpot.
- Verify HubSpot status matches SDK status for `in_progress` and `completed`.

No persistent artifacts created for validation.

---

### Phase 4 — Deprecate Workitems/Dependencies
Objective: Remove local dependency model superseded by SDK Tasks.

Actions:
- Deprecate/remove `INTENT_SCHEMA.workitems/dependsOn/outputsTo` in `src/runtime/schemas.ts` once SDK Tasks are confirmed to handle dependencies.
- Remove any custom workitem executor/validator (if present elsewhere).
- Update any tests or scripts that rely on deterministic workitem validation.

Note: A dependency-execution module is not visible in the current repo. If it exists in another branch, it should be removed as part of this phase.

---

### Phase 5 — Run Notes (Keep SDK Summaries + Add Task Events)
Objective: Preserve SDK summary streams and add task lifecycle visibility.

Keep:
- SDK summary streams for `plan`, `execution`, and `tool_usage`.

Add:
- Task lifecycle summary per run (IDs, titles, status transitions).
- Optional HubSpot task IDs for audit traceability.

---

## Config / Environment
- Set `CLAUDE_CODE_TASK_LIST_ID` per deal/session.
  - Recommended: `CLAUDE_CODE_TASK_LIST_ID=<dealId>` for isolation and continuity.

---

## Open Items Before Implementation
1. Confirm exact SDK task lifecycle event schema and status enums.
2. Decide HubSpot status mapping for SDK `in_progress` and `completed` (API field values).
3. Identify any hidden or out-of-repo dependency executor tied to `workitems/dependsOn`.
