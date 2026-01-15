import { query } from "@anthropic-ai/claude-agent-sdk";
import { DEAL_SUMMARY_SCHEMA } from "./schemas";
import { getClaudeCodePath, getClaudeEnv, extractStructuredOutput } from "./claude";
import { fetchDealEngagements, fetchDealProperties, updateDealProperties } from "../lib/hubspot";
import { STAGE_NAMES } from "../config/dealStage";
import { buildStreamingPrompt } from "./promptStream";

const SUPPORT_CHANNEL_VALUES = new Set([
  "email",
  "help_center",
  "web_and_mobile_messaging",
  "social_messaging",
  "voice",
  "text",
  "live_chat",
  "web_widget_classic",
  "api",
  "mobile_sdk",
  "channel_integrations",
  "computer_telephony_integration",
  "closed_tickets"
]);

const SUPPORT_CHANNEL_ALIASES: Record<string, string> = {
  email: "email",
  "e-mail": "email",
  "help center": "help_center",
  "help centre": "help_center",
  "knowledge base": "help_center",
  kb: "help_center",
  "web and mobile messaging": "web_and_mobile_messaging",
  messaging: "web_and_mobile_messaging",
  "web messaging": "web_and_mobile_messaging",
  "mobile messaging": "web_and_mobile_messaging",
  "social messaging": "social_messaging",
  voice: "voice",
  phone: "voice",
  call: "voice",
  text: "text",
  sms: "text",
  "live chat": "live_chat",
  chat: "live_chat",
  "web widget (classic)": "web_widget_classic",
  "web widget": "web_widget_classic",
  widget: "web_widget_classic",
  api: "api",
  "mobile sdk": "mobile_sdk",
  sdk: "mobile_sdk",
  "channel integrations": "channel_integrations",
  integrations: "channel_integrations",
  "computer telephony integration": "computer_telephony_integration",
  cti: "computer_telephony_integration",
  "closed tickets": "closed_tickets"
};

function normalizeSupportChannels(values: string[]) {
  if (!Array.isArray(values)) return [];
  const normalized = new Set<string>();

  for (const raw of values) {
    if (typeof raw !== "string") continue;
    const trimmed = raw.trim().toLowerCase();
    if (!trimmed) continue;

    if (SUPPORT_CHANNEL_VALUES.has(trimmed)) {
      normalized.add(trimmed);
      continue;
    }

    if (SUPPORT_CHANNEL_ALIASES[trimmed]) {
      normalized.add(SUPPORT_CHANNEL_ALIASES[trimmed]);
      continue;
    }

    const underscored = trimmed.replace(/\s+/g, "_");
    if (SUPPORT_CHANNEL_VALUES.has(underscored)) {
      normalized.add(underscored);
    }
  }

  return Array.from(normalized);
}

export function formatSummaryForPrompt(summary: any) {
  if (!summary) return "";
  let data = summary;
  if (typeof summary === "string") {
    try {
      data = JSON.parse(summary);
    } catch {
      return summary;
    }
  }

  const latestComms = Array.isArray(data.latestComms)
    ? data.latestComms
      .map((entry: any) => {
        const ts = entry?.timestamp || "unknown";
        const dir = entry?.direction || "unknown";
        const type = entry?.type || "unknown";
        const summaryLine = entry?.summary || "";
        return `- [${ts}] ${dir} ${type}${summaryLine ? ` — ${summaryLine}` : ""}`;
      })
      .join("\n")
    : "none";

  return `DEAL STATE:
- Stage: ${data.stage || "Unknown"}
- Gaps to advance: ${data.stageGaps?.length ? data.stageGaps.join(", ") : "none"}

BANT:
- Budget: ${data.budget?.value ? `${data.budget.currency || "USD"} ${data.budget.value} (${data.budget.confidence})` : "Unknown"}
- Authority: ${data.authority?.decisionMaker || "Unknown"}${data.authority?.level ? ` (${data.authority.level.replace("_", " ")})` : ""}${data.authority?.needsApproval?.length ? ` - Also needs: ${data.authority.needsApproval.join(", ")}` : ""}
- Need: ${data.need?.primaryPain || "Unknown"}${data.need?.challenges?.length ? ` | Challenges: ${data.need.challenges.join(", ")}` : ""}
- Timeline: ${data.timeline?.deadline || "Unknown"} (${data.timeline?.urgency || "unknown"} urgency)

SIZING:
- Agents Required: ${data.sizing?.agents_required ?? "Unknown"}
- Support Channels: ${data.sizing?.support_channels?.length ? data.sizing.support_channels.join(", ") : "Unknown"}
- Ticket Volume / Month: ${data.sizing?.ticket_volume_per_month ?? "Unknown"}

RELATIONSHIP:
- Sentiment: ${data.sentiment || "Unknown"}
- Open Objections: ${data.objections?.open?.length ? data.objections.open.join(", ") : "none"}
- Resolved Objections: ${data.objections?.resolved?.length ? data.objections.resolved.join(", ") : "none"}
- Agreed Next Step: ${data.agreedNextStep || "None"}
- Open Questions: ${data.openQuestions?.length ? data.openQuestions.join(", ") : "none"}
- Latest Comms:
${latestComms}

NARRATIVE: ${data.narrative || "No additional context"}`;
}

export async function updateDealSummary(dealId: string, summary: any) {
  const summaryJson = typeof summary === "string" ? summary : JSON.stringify(summary);
  const properties: Record<string, string> = { deal_summary: summaryJson };

  if (typeof summary === "object" && summary !== null) {
    if (summary.budget?.value !== null && summary.budget?.confidence !== "unknown") {
      properties.amount = String(summary.budget.value);
    }
    if (summary.need?.primaryPain) {
      properties.sw_primary_pain = summary.need.primaryPain;
    }
    if (summary.need?.challenges?.length > 0) {
      properties.key_challenges = summary.need.challenges.join("; ");
    }
    if (summary.timeline?.deadline) {
      const parsed = Date.parse(summary.timeline.deadline);
      if (!isNaN(parsed)) {
        const dateOnly = new Date(summary.timeline.deadline + "T00:00:00Z");
        properties.timeline_for_change = String(dateOnly.getTime());
      }
    }
    if (summary.sizing?.agents_required !== null && summary.sizing?.agents_required !== undefined) {
      properties.agents_required = String(summary.sizing.agents_required);
    }
    if (summary.sizing?.ticket_volume_per_month !== null && summary.sizing?.ticket_volume_per_month !== undefined) {
      properties.ticket_volume_per_month = String(summary.sizing.ticket_volume_per_month);
    }
    if (summary.sizing?.support_channels?.length > 0) {
      const normalizedChannels = normalizeSupportChannels(summary.sizing.support_channels);
      if (normalizedChannels.length > 0) {
        properties.support_channels = normalizedChannels.join("; ");
      }
    }
  }

  await updateDealProperties(dealId, properties);
}


export async function generateDealSummary({
  dealId,
  stageContext,
  sessionId,
  systemPromptAppend
}: {
  dealId: string;
  stageContext?: any;
  sessionId?: string | null;
  systemPromptAppend: string;
}) {
  const dealProperties = await fetchDealProperties(dealId, [
    "dealname",
    "dealstage",
    "deal_summary",
    "sw_primary_pain",
    "key_challenges",
    "tools_in_use",
    "amount",
    "timeline_for_change",
    "agents_required",
    "support_channels",
    "ticket_volume_per_month",
    "hs_num_of_associated_line_items"
  ]);

  const engagements = await fetchDealEngagements(dealId);
  const limitRaw = Number.parseInt(process.env.SUMMARY_ENGAGEMENT_LIMIT || "12", 10);
  const engagementLimit = Number.isFinite(limitRaw) ? limitRaw : 12;
  const recentEngagements = engagements.slice(0, engagementLimit);
  const stageName = STAGE_NAMES[String(dealProperties.dealstage || "")] || dealProperties.dealstage || "Unknown";

  const summaryPrompt = `You are a CRM summarizer. Given deal data and engagement history, produce a structured summary for a sales agent.

DEAL PROPERTIES:
${JSON.stringify({ ...dealProperties, stageName }, null, 2)}

ENGAGEMENTS (most recent first, limit ${engagementLimit}):
${recentEngagements.map((e) => `[${e.timestamp}] ${e.direction} ${e.type}: ${e.subject}\n${e.body}`).join("\n---\n")}

STAGE CONTEXT:
${stageContext ? JSON.stringify(stageContext, null, 2) : "None"}

Be accurate. If information is not available, use null or empty arrays. Do not invent data.

latestComms requirements:
- Provide up to 3 items, most recent first.
- Each item must include timestamp, direction, type, and a 1-sentence summary (max ~200 chars).
- Focus on the most decision-relevant interactions (questions, objections, commitments, next steps).`;

  let sessionFromResult: string | undefined;
  let structured: any = null;

  for await (const message of query({
    prompt: buildStreamingPrompt(summaryPrompt),
    options: {
      model: "opus",
      resume: sessionId || undefined,
      executable: "bun",
      pathToClaudeCodeExecutable: getClaudeCodePath(),
      env: getClaudeEnv(),
      systemPrompt: { type: "preset", preset: "claude_code", append: systemPromptAppend },
      settingSources: ["project", "user"],
      allowedTools: ["StructuredOutput"],
      outputFormat: { type: "json_schema", schema: DEAL_SUMMARY_SCHEMA },
      permissionMode: "bypassPermissions"
    }
  })) {
    if (message.type === "system" && message.subtype === "init") {
      sessionFromResult = message.session_id;
    }
    const extracted = extractStructuredOutput(message);
    if (extracted !== null && extracted !== undefined) {
      structured = extracted;
    }
  }

  return { summary: structured, sessionId: sessionFromResult };
}
