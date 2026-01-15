import { appendFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { RUN_NOTE_INSIGHTS_SCHEMA } from "./schemas";
import { getClaudeCodePath, getClaudeEnv, extractStructuredOutput } from "./claude";
import { buildStreamingPrompt } from "./promptStream";

type PlanSummary = {
  intent: string | null;
  goal: string | null;
  workitemCount: number;
  tasks: Array<{ order: number; task: string; type: string }>;
};

type JudgeSummary = {
  pass: boolean | null;
  score: number | null;
  violationsCount: number;
  suggestionsCount: number;
  violationCodes: string[];
};

type ExecutionSummary = {
  success: boolean | null;
  error: string | null;
  executedCount: number;
  executedTasks: Array<{ taskId: string; task: string; outcome: string }>;
};

type ToolUsageSummary = {
  totalCalls: number;
  totalFailures: number;
  tools: Array<{ name: string; calls: number; failures: number }>;
  autoCorrections?: Array<{ name: string; count: number; types: string[] }>;
  permissionDecisions?: {
    counts?: { allow: number; deny: number; ask: number };
    denials?: Array<{ toolName: string; message?: string }>;
  };
  mcpInitErrors?: Array<{ name: string; status: string; error?: string }>;
  subagentsUsed?: Array<{ agentId: string; agentType: string }>;
};

export type RetrySummaryEntry = {
  category: string;
  attempt: number;
  feedback: string;
  outcome: "retry" | "escalated" | "resolved";
};

type RunNoteInsights = {
  whatWorked: string[];
  whatDidnt: string[];
  missingContext: string[];
  harnessSuggestions: string[];
};

export type RunNote = {
  timestamp: string;
  runId: string;
  source: string;
  dealId: string | null;
  contactId: string | null;
  sessionId: string | null;
  blockingArtifact: string | null;
  planSummary: PlanSummary | null;
  judgeSummary: JudgeSummary | null;
  executionSummary: ExecutionSummary | null;
  toolUsage: ToolUsageSummary | null;
  retrySummary: RetrySummaryEntry[] | null;
  insights: RunNoteInsights;
};

function safeArray<T>(value: T[] | undefined | null) {
  return Array.isArray(value) ? value : [];
}

function mergeInsightList(base: string[], extra: string[]) {
  const set = new Set<string>();
  for (const item of base) {
    if (item) set.add(item);
  }
  for (const item of extra) {
    if (item) set.add(item);
  }
  return Array.from(set).slice(0, 5);
}

function buildDeterministicInsights(toolUsage?: ToolUsageSummary | null): Partial<RunNoteInsights> {
  if (!toolUsage) return {};

  const whatWorked: string[] = [];
  const whatDidnt: string[] = [];
  const harnessSuggestions: string[] = [];

  if (toolUsage.autoCorrections && toolUsage.autoCorrections.length > 0) {
    const formatted = toolUsage.autoCorrections
      .slice(0, 3)
      .map((c) => `${c.name} (${c.types?.slice(0, 3).join(", ") || "auto-corrected"})`)
      .join("; ");
    harnessSuggestions.push(`Auto-corrections applied: ${formatted}`);
  }

  const denial = toolUsage.permissionDecisions?.denials?.[0];
  if (denial) {
    whatDidnt.push(`Tool denied: ${denial.toolName}${denial.message ? ` — ${denial.message}` : ""}`);
  }

  if (toolUsage.mcpInitErrors && toolUsage.mcpInitErrors.length > 0) {
    const summary = toolUsage.mcpInitErrors
      .slice(0, 3)
      .map((m) => `${m.name}: ${m.status}${m.error ? ` (${m.error})` : ""}`)
      .join("; ");
    whatDidnt.push(`MCP init failed: ${summary}`);
  }

  if (toolUsage.subagentsUsed && toolUsage.subagentsUsed.length > 0) {
    const names = Array.from(new Set(toolUsage.subagentsUsed.map((s) => s.agentType).filter(Boolean))).slice(0, 4);
    if (names.length > 0) whatWorked.push(`Subagents used: ${names.join(", ")}`);
  }

  return { whatWorked, whatDidnt, missingContext: [], harnessSuggestions };
}

export function buildPlanSummary(plan: any): PlanSummary | null {
  if (!plan) return null;
  const workitems = safeArray(plan.workitems) as any[];
  const tasks = workitems
    .filter((w: any) => w && typeof w.task === "string")
    .map((w: any) => ({
      order: Number.isFinite(w.order) ? w.order : 0,
      task: String(w.task || ""),
      type: String(w.type || "internal_action")
    }))
    .slice(0, 6);

  return {
    intent: plan.intent || null,
    goal: plan.goal || null,
    workitemCount: safeArray(plan.workitems).length,
    tasks
  };
}

export function buildJudgeSummary(judge: any): JudgeSummary | null {
  if (!judge) return null;
  const violations = safeArray(judge.violations);
  const suggestions = safeArray(judge.suggestions);
  const violationCodes = violations
    .map((v: any) => String(v.code || ""))
    .filter(Boolean)
    .slice(0, 8);

  return {
    pass: typeof judge.pass === "boolean" ? judge.pass : null,
    score: Number.isFinite(judge.score) ? judge.score : null,
    violationsCount: violations.length,
    suggestionsCount: suggestions.length,
    violationCodes
  };
}

export function buildExecutionSummary(execResult: any): ExecutionSummary | null {
  if (!execResult) return null;
  const executed = safeArray(execResult.executedTasks);
  const tasks = executed.slice(0, 8).map((t: any) => ({
    taskId: String(t.taskId || ""),
    task: String(t.task || ""),
    outcome: String(t.outcome || "")
  }));

  return {
    success: typeof execResult.success === "boolean" ? execResult.success : null,
    error: execResult.error ? String(execResult.error) : null,
    executedCount: executed.length,
    executedTasks: tasks
  };
}


export async function generateRunNoteInsights({
  source,
  blockingArtifact,
  planSummary,
  judgeSummary,
  executionSummary,
  toolUsage,
  systemPromptAppend
}: {
  source: string;
  blockingArtifact: string | null;
  planSummary: PlanSummary | null;
  judgeSummary: JudgeSummary | null;
  executionSummary: ExecutionSummary | null;
  toolUsage: ToolUsageSummary | null;
  systemPromptAppend: string;
}): Promise<RunNoteInsights> {
  // Skip LLM-based insights during eval runs to avoid 90s+ overhead per turn
  if (process.env.SKIP_RUN_NOTE_LLM === "true") {
    const deterministic = buildDeterministicInsights(toolUsage);
    return {
      whatWorked: deterministic.whatWorked || [],
      whatDidnt: deterministic.whatDidnt || [],
      missingContext: deterministic.missingContext || [],
      harnessSuggestions: deterministic.harnessSuggestions || []
    };
  }

  const prompt = `You generate concise run notes for an internal sales agent harness.

Return arrays of short bullet-style strings (no more than ~200 chars per item).
Use at most 5 items per list. If nothing applies, return an empty array.
If toolUsage includes autoCorrections or permissionDecisions, mention the most important ones under whatDidnt or harnessSuggestions.

RUN CONTEXT:
${JSON.stringify(
    {
      source,
      blockingArtifact,
      planSummary,
      judgeSummary,
      executionSummary,
      toolUsage
    },
    null,
    2
  )}`;

  let structured: any = null;

  for await (const message of query({
    prompt: buildStreamingPrompt(prompt),
    options: {
      model: "opus",
      executable: "bun",
      pathToClaudeCodeExecutable: getClaudeCodePath(),
      env: getClaudeEnv(),
      systemPrompt: { type: "preset", preset: "claude_code", append: systemPromptAppend },
      settingSources: ["project", "user"],
      allowedTools: ["StructuredOutput"],
      outputFormat: { type: "json_schema", schema: RUN_NOTE_INSIGHTS_SCHEMA },
      permissionMode: "bypassPermissions"
    }
  })) {
    const extracted = extractStructuredOutput(message);
    if (extracted !== null && extracted !== undefined) {
      structured = extracted;
    }
  }

  if (!structured) {
    return { whatWorked: [], whatDidnt: [], missingContext: [], harnessSuggestions: [] };
  }

  return structured as RunNoteInsights;
}

export async function createRunNote({
  source,
  dealId,
  contactId,
  sessionId,
  blockingArtifact,
  planSummary,
  judgeSummary,
  executionSummary,
  toolUsage,
  retrySummary,
  systemPromptAppend
}: {
  source: string;
  dealId: string | null;
  contactId: string | null;
  sessionId: string | null;
  blockingArtifact: string | null;
  planSummary: PlanSummary | null;
  judgeSummary: JudgeSummary | null;
  executionSummary: ExecutionSummary | null;
  toolUsage: ToolUsageSummary | null;
  retrySummary?: RetrySummaryEntry[] | null;
  systemPromptAppend: string;
}): Promise<RunNote> {
  const timestamp = new Date().toISOString();
  const runId = `${sessionId || dealId || "run"}-${Date.now()}`;
  let insights: RunNoteInsights;

  try {
    insights = await generateRunNoteInsights({
      source,
      blockingArtifact,
      planSummary,
      judgeSummary,
      executionSummary,
      toolUsage,
      systemPromptAppend
    });
  } catch {
    insights = { whatWorked: [], whatDidnt: [], missingContext: [], harnessSuggestions: [] };
  }

  const deterministic = buildDeterministicInsights(toolUsage);
  insights = {
    whatWorked: mergeInsightList(insights.whatWorked, deterministic.whatWorked || []),
    whatDidnt: mergeInsightList(insights.whatDidnt, deterministic.whatDidnt || []),
    missingContext: mergeInsightList(insights.missingContext, deterministic.missingContext || []),
    harnessSuggestions: mergeInsightList(insights.harnessSuggestions, deterministic.harnessSuggestions || [])
  };

  return {
    timestamp,
    runId,
    source,
    dealId,
    contactId,
    sessionId,
    blockingArtifact,
    planSummary,
    judgeSummary,
    executionSummary,
    toolUsage,
    retrySummary: retrySummary && retrySummary.length > 0 ? retrySummary : null,
    insights
  };
}

export function appendRunNote(note: RunNote) {
  const notesDir = join(process.cwd(), "data", "run-notes");
  if (!existsSync(notesDir)) {
    mkdirSync(notesDir, { recursive: true });
  }
  const dateKey = note.timestamp.slice(0, 10);
  const filePath = join(notesDir, `${dateKey}.jsonl`);
  appendFileSync(filePath, JSON.stringify(note) + "\n");
}

export function appendSimpleRunNote({
  source,
  dealId,
  contactId,
  sessionId,
  blockingArtifact,
  insights,
  toolUsage,
  retrySummary
}: {
  source: string;
  dealId: string | null;
  contactId: string | null;
  sessionId: string | null;
  blockingArtifact: string | null;
  insights: RunNoteInsights;
  toolUsage?: ToolUsageSummary | null;
  retrySummary?: RetrySummaryEntry[] | null;
}) {
  const note: RunNote = {
    timestamp: new Date().toISOString(),
    runId: `${sessionId || dealId || source}-${Date.now()}`,
    source,
    dealId,
    contactId,
    sessionId,
    blockingArtifact,
    planSummary: null,
    judgeSummary: null,
    executionSummary: null,
    toolUsage: toolUsage || null,
    retrySummary: retrySummary && retrySummary.length > 0 ? retrySummary : null,
    insights
  };
  appendRunNote(note);
}
