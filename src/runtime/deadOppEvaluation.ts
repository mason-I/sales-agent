import { query } from "@anthropic-ai/claude-agent-sdk";
import { DEAD_OPP_EVAL_SCHEMA } from "./schemas";
import { getClaudeCodePath, getClaudeEnv, extractStructuredOutput } from "./claude";
import { formatSummaryForPrompt } from "./summary";
import { createSalesMcpServer } from "../tools/mcp";
import { buildStreamingPrompt } from "./promptStream";

const MCP_PREFIX = "mcp__sales-crm__";
const KB_TOOL_NAME = `${MCP_PREFIX}kb_searchZendesk`;
const REENGAGE_THRESHOLD = 70;
const TIMING_WINDOW_DAYS = 90;

const REASON_SCORE_MAP: Record<string, number> = {
  timing: 30,
  budget: 20,
  competitor: 10,
  missing_feature: 0,
  no_fit: 0,
  no_need: 0,
  not_interested: 0,
  unknown: 0
};

function parseTimestamp(value?: string | null) {
  if (!value) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  const numeric = Number(trimmed);
  if (!Number.isNaN(numeric) && Number.isFinite(numeric)) {
    return numeric;
  }
  const parsed = Date.parse(trimmed);
  if (Number.isNaN(parsed)) return null;
  return parsed;
}

function daysSince(timestamp: number | null) {
  if (!timestamp) return null;
  const delta = Date.now() - timestamp;
  if (!Number.isFinite(delta)) return null;
  return Math.floor(delta / (1000 * 60 * 60 * 24));
}

function parseDateOnly(value: string | null) {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Date.parse(trimmed);
  if (!Number.isNaN(parsed)) return parsed;
  return null;
}

function scoreSentiment(sentiment?: string | null) {
  switch (sentiment) {
    case "positive":
      return 15;
    case "neutral":
      return 8;
    case "hesitant":
      return 4;
    case "cold":
      return 0;
    default:
      return 0;
  }
}

function scoreCompleteness(summary: any) {
  const signals = [
    summary?.budget?.value ? 1 : 0,
    summary?.authority?.decisionMaker ? 1 : 0,
    summary?.need?.primaryPain ? 1 : 0,
    summary?.sizing?.agents_required ? 1 : 0,
    Array.isArray(summary?.sizing?.support_channels) && summary.sizing.support_channels.length > 0 ? 1 : 0,
    summary?.sizing?.ticket_volume_per_month ? 1 : 0
  ];
  const count = signals.reduce((acc, value) => acc + value, 0);
  if (count >= 4) return 10;
  if (count >= 2) return 5;
  return 0;
}


export type DeadOppEvaluation = {
  reasonCategory: string;
  reasonSummary: string;
  featureGap: { isFeatureGap: boolean; feature: string | null };
  followUpDate: string | null;
  followUpDateSource: string | null;
  sentiment: string;
  doNotContact: boolean;
  hardBlocker: boolean;
  hardBlockerReason: string | null;
  kbCheck: { status: "FOUND" | "NOT_FOUND" | "SKIPPED" | "ERROR" | null; links: string[]; summary: string | null };
};

export type DeadOppScoring = {
  timing: number;
  reason: number;
  featureResolved: number;
  engagement: number;
  completeness: number;
  total: number;
};

export async function evaluateDeadOpportunity({
  dealId,
  closedLostReason,
  lastContacted,
  dealSummary,
  systemPromptAppend,
  mcpServers
}: {
  dealId: string;
  closedLostReason: string;
  lastContacted?: string | null;
  dealSummary?: any;
  systemPromptAppend: string;
  mcpServers?: Record<string, any>;
}) {
  let normalizedSummary: any = dealSummary;
  if (typeof dealSummary === "string") {
    try {
      normalizedSummary = JSON.parse(dealSummary);
    } catch {
      normalizedSummary = dealSummary;
    }
  }

  const summaryText = normalizedSummary ? formatSummaryForPrompt(normalizedSummary) : "No deal summary available.";
  const lastContactedTs = parseTimestamp(lastContacted || null);
  const lastContactedDate = lastContactedTs ? new Date(lastContactedTs).toISOString() : "unknown";
  const lastContactedDays = daysSince(lastContactedTs);

  const systemPrompt = `You are reviewing a closed-lost deal to decide if re-engagement is worthwhile.

Rules:
- Use the closed lost reason and deal summary to classify the reason.
- If the reason indicates a missing feature or capability gap, call the Zendesk KB search tool.
- KB search objective must be: "Zendesk <feature>".
- Only set followUpDate if a specific date or month/year is explicitly requested. Use ISO date (YYYY-MM-DD).
- If the follow-up date is ambiguous, return null.
- HardBlocker=true for permanent no-fit, compliance constraints, explicit do-not-contact, or "never" statements.
- DoNotContact=true only if explicit.
- Keep reasonSummary concise (1-2 sentences).`;

  const userPrompt = `Deal ID: ${dealId}
Closed Lost Reason: ${closedLostReason || "(missing)"}
Last Contacted (notes_last_contacted): ${lastContactedDate}

Latest Deal Summary:
${summaryText}`;

  let structured: DeadOppEvaluation | null = null;
  let sessionFromResult: string | undefined;

  const allowedTools = ["StructuredOutput", KB_TOOL_NAME];

  for await (const message of query({
    prompt: buildStreamingPrompt(userPrompt),
    options: {
      model: "opus",
      executable: "bun",
      pathToClaudeCodeExecutable: getClaudeCodePath(),
      env: getClaudeEnv(),
      systemPrompt: { type: "preset", preset: "claude_code", append: `${systemPromptAppend}\n\n${systemPrompt}` },
      settingSources: ["project", "user"],
      allowedTools,
      mcpServers: mcpServers || { "sales-crm": createSalesMcpServer() },
      outputFormat: { type: "json_schema", schema: DEAD_OPP_EVAL_SCHEMA },
      permissionMode: "bypassPermissions"
    }
  })) {
    if (message.type === "system" && message.subtype === "init") {
      sessionFromResult = message.session_id;
    }
    const extracted = extractStructuredOutput(message);
    if (extracted !== null && extracted !== undefined) {
      structured = extracted as DeadOppEvaluation;
    }
  }

  if (!structured) {
    throw new Error("Dead opportunity evaluation returned no structured output.");
  }

  if (!structured.kbCheck) {
    structured.kbCheck = { status: "SKIPPED", links: [], summary: null };
  }
  if (!structured.kbCheck.status) {
    structured.kbCheck.status = "SKIPPED";
  }

  const followUpTs = parseDateOnly(structured.followUpDate || null);
  const followUpDue = followUpTs ? followUpTs <= Date.now() : false;

  const timingPass = (lastContactedDays !== null && lastContactedDays >= TIMING_WINDOW_DAYS) || followUpDue;
  const timingScore = timingPass ? 20 : 0;

  const reasonScore = REASON_SCORE_MAP[structured.reasonCategory] ?? 0;
  const featureResolvedScore = structured.featureGap?.isFeatureGap && structured.kbCheck?.status === "FOUND" ? 25 : 0;
  const engagementScore = scoreSentiment(structured.sentiment);
  const completenessScore = scoreCompleteness(normalizedSummary);

  const totalScore = Math.min(100, timingScore + reasonScore + featureResolvedScore + engagementScore + completenessScore);
  const hardBlocker = structured.hardBlocker || structured.doNotContact;
  const decision = !hardBlocker && timingPass && totalScore >= REENGAGE_THRESHOLD ? "RE-ENGAGE" : "KEEP_CLOSED_LOST";

  const scoring: DeadOppScoring = {
    timing: timingScore,
    reason: reasonScore,
    featureResolved: featureResolvedScore,
    engagement: engagementScore,
    completeness: completenessScore,
    total: totalScore
  };

  return {
    evaluation: structured,
    scoring,
    decision,
    timingPass,
    lastContactedDays,
    followUpDue,
    followUpDate: structured.followUpDate || null,
    sessionId: sessionFromResult
  };
}
