import { query } from "@anthropic-ai/claude-agent-sdk";
import { fileURLToPath } from "url";
import { resolve, dirname } from "path";
import { readFileSync, createWriteStream, mkdirSync } from "fs";
import { loadEnv } from "../lib/env";
import { runPreLlm } from "./preLlm";
import { fetchDealProperties, updateDealProperties, fetchDealEngagements, hubspotRequest } from "../lib/hubspot";
import { createSalesMcpServer } from "../tools/mcp";
import { getClaudeCodePath, getClaudeEnv, extractStructuredOutput } from "./claude";
import { buildSystemPrompt, buildEventPrompt, type DealContext, type EventContext } from "./systemPrompt";
import { buildSalesAgentHooks, createEnforcementState } from "./hooks";
import { STAGE_NAMES } from "../config/dealStage";
import { createRunNote, appendRunNote, buildPlanSummary, buildJudgeSummary, buildExecutionSummary, type TaskLifecycleSummary } from "./runNotes";
import { buildStreamingPrompt } from "./promptStream";
import { generateDealSummary, updateDealSummary } from "./summary";
import { deriveCommitmentState, deriveNextActionPolicy, fetchCommitmentArtifacts, evaluateDraftEvidence } from "./commitment";
import { advanceCommitmentStage, computeCommitmentGap, fetchStageProperties } from "./commitmentStage";
import { mirrorSdkTaskToHubSpot, readTaskSummaryFromDisk, validateTaskMirror, type SdkTaskStatus } from "./taskMirror";
import { INBOUND_SIGNAL_SCHEMA } from "./schemas";

const MCP_PREFIX = "mcp__sales-crm__";

// Tools the agent can use (fully autonomous - no human escalation tools)
const ALLOWED_TOOLS = [
  "Skill",
  "Task",
  "TaskCreate",
  "TaskUpdate",
  "TaskList",
  "TaskGet",
  "Read",
  "Glob",
  "Bash",
  "StructuredOutput",
  "mcp__list_resources",
  "mcp__read_resource",
  `${MCP_PREFIX}crm_upsertContact`,
  `${MCP_PREFIX}crm_logEmailDraft`,
  `${MCP_PREFIX}crm_createLineItemsForDeal`,
  `${MCP_PREFIX}crm_createDraftInvoice`,
  `${MCP_PREFIX}kb_searchZendesk`,
  `${MCP_PREFIX}crm_updateDealProperties`,
  `${MCP_PREFIX}crm_updateContact`,
  `${MCP_PREFIX}crm_addDealNote`,
  `${MCP_PREFIX}crm_createTask`,
  `${MCP_PREFIX}crm_getContactDeals`,
  `${MCP_PREFIX}crm_getDealEngagements`,
  `${MCP_PREFIX}crm_getTask`,
  `${MCP_PREFIX}crm_updateTask`
];

// Subagents for specialized work
const SALES_SUBAGENTS = {
  "kb-researcher": {
    description: "Zendesk KB researcher. Use for Zendesk capability/how-to questions that need deep research.",
    prompt: "Use the zendesk-kb-search skill to answer the capability question. Return grounded details or NOT_FOUND. Never guess.",
    tools: ["Skill", "mcp__list_resources", "mcp__read_resource", `${MCP_PREFIX}kb_searchZendesk`, `${MCP_PREFIX}crm_getDealEngagements`]
  },
  "draft-writer": {
    description: "Email draft specialist. Drafts async-only replies and logs them in HubSpot.",
    prompt: "Use the draft-reply skill to produce and log the email draft. Keep it async-only and compliant. You MUST call crm_logEmailDraft.",
    tools: ["Skill", "mcp__list_resources", "mcp__read_resource", `${MCP_PREFIX}crm_logEmailDraft`, `${MCP_PREFIX}crm_getDealEngagements`, `${MCP_PREFIX}crm_updateDealProperties`, `${MCP_PREFIX}crm_addDealNote`]
  },
  "services-quoter": {
    description: "Pricing and invoicing specialist. Creates line items and draft invoices.",
    prompt: "Use the services-invoicing skill to create line items and a draft invoice. Ensure pricing intent is present, catalog has been read, and tier selection is clear.",
    tools: ["Skill", "mcp__list_resources", "mcp__read_resource", `${MCP_PREFIX}crm_createLineItemsForDeal`, `${MCP_PREFIX}crm_createDraftInvoice`, `${MCP_PREFIX}crm_getDealEngagements`]
  }
};

const SUPPORT_CHANNEL_CANONICAL = new Set([
  "email",
  "help_center",
  "web_and_mobile_messaging",
  "social_messaging",
  "voice",
  "text",
  "live_chat",
  "web_widget_classic",
  "mobile_sdk",
  "api",
  "channel_integrations",
  "computer_telephony_integration",
  "closed_tickets"
]);

type AgentEvent = {
  source: "new_inbound" | "reply_to_existing" | "stale_deal" | "cron";
  type?: "email" | "call";
  dealId?: string;
  contactId?: string;
  fromEmail?: string;
  fromName?: string;
  subject?: string;
  body?: string;
  resumeOnly?: boolean;
  verbose?: boolean;
  disableResume?: boolean;
  logPrefix?: string;
  traceFilePath?: string;
};

type AgentResult = {
  success: boolean;
  dealId: string;
  contactId: string | null;
  sessionId: string | null;
  lastDraft?: { subject: string; body: string; emailId?: string | null } | null;
  error?: string;
};

type EmailDraft = { subject: string; body: string; emailId?: string | null };

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  return Promise.race([promise, timeout]).finally(() => {
    if (timeoutId) clearTimeout(timeoutId);
  });
}

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) {
    return "";
  }
  return await new Promise((resolve) => {
    let data = "";
    process.stdin.setEncoding("utf-8");
    process.stdin.on("data", (chunk) => (data += chunk));
    process.stdin.on("end", () => resolve(data.trim()));
  });
}

function buildEventFromEnv(): AgentEvent {
  return {
    source: (process.env.EVENT_SOURCE as AgentEvent["source"]) || "new_inbound",
    type: (process.env.EVENT_TYPE as "email" | "call") || "email",
    fromEmail: process.env.EMAIL_FROM,
    fromName: process.env.EMAIL_FROM_NAME,
    subject: process.env.EMAIL_SUBJECT,
    body: process.env.EMAIL_BODY,
    dealId: process.env.DEAL_ID,
    contactId: process.env.CONTACT_ID,
    resumeOnly: process.env.RESUME_ONLY === "1" || process.env.RESUME_ONLY === "true"
  };
}

async function resolveEvent(explicitEvent?: AgentEvent): Promise<AgentEvent> {
  if (explicitEvent) return explicitEvent;
  const stdin = await readStdin();
  return stdin ? JSON.parse(stdin) : buildEventFromEnv();
}

async function getContactForDeal(dealId: string): Promise<string | null> {
  try {
    const assoc = await hubspotRequest<any>("GET", `/crm/v4/objects/deals/${dealId}/associations/contacts?limit=1`);
    return assoc.results?.[0]?.toObjectId || null;
  } catch {
    return null;
  }
}

async function fetchDealContext(dealId: string): Promise<DealContext> {
  // Run all HubSpot API calls in parallel for better performance
  const [properties, contactId, engagements] = await Promise.all([
    fetchDealProperties(dealId, [
      "dealname",
      "dealstage",
      "deal_summary",
      "session_id",
      "sw_primary_pain",
      "key_challenges",
      "timeline_for_change",
      "agents_required",
      "support_channels",
      "ticket_volume_per_month",
      "amount",
      "closed_lost_reason",
      "hs_num_of_associated_line_items"
    ]),
    getContactForDeal(dealId),
    fetchDealEngagements(dealId)
  ]);

  return {
    dealId,
    contactId,
    dealName: properties.dealname,
    dealStage: properties.dealstage,
    dealStageName: STAGE_NAMES[properties.dealstage] || properties.dealstage,
    dealSummary: properties.deal_summary,
    properties,
    recentEngagements: engagements.slice(0, 5)
  };
}

async function persistSession(dealId: string, sessionId: string): Promise<void> {
  await updateDealProperties(dealId, { session_id: sessionId });
}

function isPositiveNumber(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  const parsed = typeof value === "string" ? Number(value) : Number(value);
  return Number.isFinite(parsed) && parsed > 0;
}

function extractAgentsRequired(text: string): number | null {
  const lower = text.toLowerCase();
  if (
    /\bjust me\b/.test(lower) ||
    /\bonly me\b/.test(lower) ||
    /\bsolo (operator|founder|agent)\b/.test(lower) ||
    /\bsingle (person|agent)\b/.test(lower) ||
    /\bone[-\s]person\b/.test(lower) ||
    /\bone person\b/.test(lower)
  ) {
    return 1;
  }

  const spelled = /\bone or two\b/.test(lower);
  if (spelled) return 1;

  const range = lower.match(/(\d+)\s*(?:-|to)\s*(\d+)\s*(agents?|people|reps?|support|operators?)/);
  if (range) {
    const min = Number(range[1]);
    return Number.isFinite(min) && min > 0 ? min : null;
  }

  const single = lower.match(/(\d+)\s*(agents?|people|reps?|support|operators?)/);
  if (single) {
    const count = Number(single[1]);
    return Number.isFinite(count) && count > 0 ? count : null;
  }

  return null;
}

function addMonths(base: Date, months: number): Date {
  const copy = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate()));
  copy.setUTCMonth(copy.getUTCMonth() + months);
  return copy;
}

function addDays(base: Date, days: number): Date {
  const copy = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate()));
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

function extractTimelineForChange(text: string, now = new Date()): number | null {
  const lower = text.toLowerCase();

  const explicitDate = Date.parse(text);
  if (!isNaN(explicitDate)) {
    const asDate = new Date(explicitDate);
    const dateOnly = new Date(Date.UTC(asDate.getUTCFullYear(), asDate.getUTCMonth(), asDate.getUTCDate()));
    return dateOnly.getTime();
  }

  if (/\bnext year\b/.test(lower) || /\bearly next year\b/.test(lower)) {
    const year = now.getUTCFullYear() + 1;
    return Date.UTC(year, 0, 1);
  }

  if (/\bthis week\b/.test(lower) || /\basap\b/.test(lower)) {
    return addDays(now, 7).getTime();
  }

  if (
    /\bas soon as possible\b/.test(lower) ||
    /\bas soon as we can\b/.test(lower) ||
    /\bready to (move forward|proceed|get started|start)\b/.test(lower) ||
    /\bmove forward\b/.test(lower) ||
    /\bmove ahead\b/.test(lower) ||
    /\bget started\b/.test(lower) ||
    /\bstart immediately\b/.test(lower) ||
    /\bright away\b/.test(lower) ||
    /\bimmediately\b/.test(lower)
  ) {
    return addDays(now, 7).getTime();
  }

  if (/\bthis month\b/.test(lower)) {
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth();
    const endOfMonth = new Date(Date.UTC(year, month + 1, 0));
    return endOfMonth.getTime();
  }

  if (/\bthis year\b/.test(lower)) {
    const year = now.getUTCFullYear();
    return Date.UTC(year, 11, 31);
  }

  if (/\bthis quarter\b/.test(lower)) {
    const quarter = Math.floor(now.getUTCMonth() / 3);
    const year = now.getUTCFullYear();
    const endOfQuarter = new Date(Date.UTC(year, quarter * 3 + 3, 0));
    return endOfQuarter.getTime();
  }

  const thisQuarterMatch = lower.match(/\bthis\s+q([1-4])\b/);
  if (thisQuarterMatch) {
    const q = Number(thisQuarterMatch[1]);
    if (Number.isFinite(q) && q >= 1 && q <= 4) {
      const year = now.getUTCFullYear();
      const endOfQuarter = new Date(Date.UTC(year, q * 3, 0));
      return endOfQuarter.getTime();
    }
  }

  const nextQuarter = /\bnext quarter\b/.test(lower);
  if (nextQuarter) {
    const currentQuarter = Math.floor(now.getUTCMonth() / 3);
    const targetQuarter = (currentQuarter + 1) % 4;
    const year = now.getUTCFullYear() + (currentQuarter === 3 ? 1 : 0);
    return Date.UTC(year, targetQuarter * 3, 1);
  }

  const quarterMatch = lower.match(/\bq([1-4])\b(?:\s*(\d{4}))?/);
  if (quarterMatch) {
    const q = Number(quarterMatch[1]);
    const yearFromText = quarterMatch[2] ? Number(quarterMatch[2]) : null;
    const currentQuarter = Math.floor(now.getUTCMonth() / 3) + 1;
    const year = yearFromText ?? (q < currentQuarter ? now.getUTCFullYear() + 1 : now.getUTCFullYear());
    return Date.UTC(year, (q - 1) * 3, 1);
  }

  const inMonths = lower.match(/\bin\s+(\d+)\s*(month|months|mo)\b/);
  if (inMonths) {
    const months = Number(inMonths[1]);
    if (Number.isFinite(months) && months > 0) {
      return addMonths(now, months).getTime();
    }
  }

  if (
    /\bmonth or two\b/.test(lower) ||
    /\bmonth or 2\b/.test(lower) ||
    /\bmonth or so\b/.test(lower) ||
    /\bnext month or two\b/.test(lower) ||
    /\bnext couple of months\b/.test(lower) ||
    /\bcouple of months\b/.test(lower)
  ) {
    return addMonths(now, 2).getTime();
  }

  const inWeeks = lower.match(/\bin\s+(\d+)\s*(week|weeks|wk|wks)\b/);
  if (inWeeks) {
    const weeks = Number(inWeeks[1]);
    if (Number.isFinite(weeks) && weeks > 0) {
      return addDays(now, weeks * 7).getTime();
    }
  }

  const inYears = lower.match(/\bin\s+(\d+)\s*(year|years)\b/);
  if (inYears) {
    const years = Number(inYears[1]);
    if (Number.isFinite(years) && years > 0) {
      return Date.UTC(now.getUTCFullYear() + years, 0, 1);
    }
  }

  if (/\bnext month\b/.test(lower)) {
    return addMonths(now, 1).getTime();
  }

  if (/\bnext week\b/.test(lower)) {
    return addDays(now, 7).getTime();
  }

  return null;
}

function extractTicketVolumePerMonth(text: string): number | null {
  const lower = text.toLowerCase();
  const monthlyMatch = lower.match(/(\d[\d,]*)\s*(tickets|inquiries|requests)\b.*\b(per\s+month|monthly|\/month)\b/);
  if (monthlyMatch) {
    const value = Number(monthlyMatch[1].replace(/,/g, ""));
    return Number.isFinite(value) && value > 0 ? value : null;
  }

  const weeklyMatch = lower.match(/(\d[\d,]*)\s*(tickets|inquiries|requests)\b.*\b(per\s+week|weekly|\/week)\b/);
  if (weeklyMatch) {
    const value = Number(weeklyMatch[1].replace(/,/g, ""));
    if (Number.isFinite(value) && value > 0) {
      return value * 4;
    }
  }

  return null;
}

function extractPrimaryPain(text: string): string | null {
  const lower = text.toLowerCase();
  if (
    /\bno pain points\b/.test(lower) ||
    /\bhaven't identified\b/.test(lower) ||
    /\bnot identified\b/.test(lower) ||
    /\bmostly curious\b/.test(lower) ||
    /\bjust curious\b/.test(lower) ||
    /\bexploratory phase\b/.test(lower)
  ) {
    return "Not identified yet (exploratory)";
  }

  return null;
}

function extractKeyChallenge(text: string): string | null {
  const lower = text.toLowerCase();
  if (/\bseasonal\b/.test(lower) || /\bseasonality\b/.test(lower) || /\bseasonal (spikes|fluctuations)\b/.test(lower)) {
    return "Seasonal volume fluctuations";
  }
  return null;
}

function inferFatigueFromText(text: string): { present: boolean; rationale: string } | null {
  const lower = text.toLowerCase();
  const signals = [
    /\bjust curious\b/,
    /\bmostly curious\b/,
    /\bno pain points\b/,
    /\bhaven't identified\b/,
    /\bexploratory phase\b/,
    /\bmaybe next year\b/,
    /\bnext year\b/,
    /\bcircle back\b/,
    /\bnot urgent\b/,
    /\bno rush\b/,
    /\bwe have what we need\b/,
    /\bi have what i need\b/,
    /\bthat's all\b/,
    /\bno further questions\b/,
    /\bno more questions\b/,
    /\bwe'?ll (get back|follow up|circle back|be in touch|let you know)\b/,
    /\bi'?ll (get back|follow up|circle back|be in touch|let you know)\b/,
    /\bdecision (next|early) week\b/,
    /\bearly next week\b/,
    /\bdiscuss (internally|with (my|our|the) team)\b/,
    /\bwe'?ll discuss\b/,
    /\bwe'?ll review\b/
  ];
  if (signals.some((s) => s.test(lower))) {
    return { present: true, rationale: "Heuristic low-intent/time-waster signals in customer reply." };
  }
  return null;
}

type InboundSignalResult = {
  agents_required: number | null;
  ticket_volume_per_month: number | null;
  support_channels: string[];
  primary_pain: string | null;
  key_challenges: string[];
  timeline: { date_utc: string | null; urgency: "high" | "medium" | "low" | "unknown"; rationale: string };
  fatigue: { present: boolean; rationale: string };
};

function parseUtcDate(value: string | null): number | null {
  if (!value || typeof value !== "string") return null;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  return Date.UTC(year, month - 1, day);
}

function coerceWholeNumber(value: unknown): number | null {
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  const rounded = Math.round(num);
  if (Math.abs(num - rounded) > 0.0001) return null;
  return rounded;
}

function sanitizeTextValue(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();
  if (["null", "none", "n/a", "na", "unknown", "not provided"].includes(lower)) {
    return null;
  }
  return trimmed;
}

function normalizeSupportChannels(values: string[]) {
  if (!Array.isArray(values)) return [];
  const normalized = new Set<string>();
  for (const raw of values) {
    if (typeof raw !== "string") continue;
    const trimmed = raw.trim().toLowerCase();
    if (!trimmed) continue;
    if (SUPPORT_CHANNEL_CANONICAL.has(trimmed)) {
      normalized.add(trimmed);
      continue;
    }
    const underscored = trimmed.replace(/\s+/g, "_");
    if (SUPPORT_CHANNEL_CANONICAL.has(underscored)) {
      normalized.add(underscored);
    }
  }
  return Array.from(normalized);
}

async function extractInboundSignalsSemantic(
  body: string,
  logVerbose: (message: string) => void
): Promise<InboundSignalResult | null> {
  const today = new Date();
  const todayIso = today.toISOString().slice(0, 10);
  const timeoutMs = 30000;
  const prompt = `You are an information extractor for a sales agent. Extract semantic signals from the customer's message.

TODAY (UTC): ${todayIso}

Return JSON that follows the provided schema exactly. Rules:
- Use only the customer's message. Do not invent or infer beyond what is stated.
- Support channels must be canonical values from this list: email, help_center, web_and_mobile_messaging, social_messaging, voice, text, live_chat, web_widget_classic, mobile_sdk, api, channel_integrations, computer_telephony_integration, closed_tickets.
- If a value is not stated, return null (or empty array for lists).
- Timeline: if the customer gives a timeframe, convert it to a UTC date string (YYYY-MM-DD) using TODAY. If unclear, return null. Include urgency (high/medium/low/unknown) and a short rationale.
- Fatigue: set present=true ONLY when the customer explicitly signals they have what they need, are done, will decide later, want to wait, are not ready yet, or are just looking/just exploring/still early. Otherwise false. Provide a brief rationale either way.

CUSTOMER MESSAGE:
${body}`;

  let structured: InboundSignalResult | null = null;
  const runner = query({
    prompt: buildStreamingPrompt(prompt),
    options: {
      model: "opus",
      executable: "bun",
      pathToClaudeCodeExecutable: getClaudeCodePath(),
      env: getClaudeEnv(),
      systemPrompt: { type: "preset", preset: "claude_code", append: "Return structured JSON only." },
      settingSources: ["user", "project"],
      allowedTools: ["StructuredOutput"],
      outputFormat: { type: "json_schema", schema: INBOUND_SIGNAL_SCHEMA },
      allowDangerouslySkipPermissions: true,
      permissionMode: "bypassPermissions",
      maxThinkingTokens: 256
    }
  });
  const timeoutId = setTimeout(() => {
    logVerbose(`[Agent] Semantic extraction timed out after ${timeoutMs}ms`);
    runner.close();
  }, timeoutMs);

  try {
    logVerbose("[Agent] Semantic extraction start");
    for await (const message of runner) {
      if (message.type === "result" && message.structured_output) {
        structured = message.structured_output as InboundSignalResult;
      }
      const extracted = extractStructuredOutput(message);
      if (extracted) {
        structured = extracted as InboundSignalResult;
      }
    }
  } catch (error: any) {
    logVerbose(`[Agent] Semantic extraction failed: ${error?.message || error}`);
  } finally {
    clearTimeout(timeoutId);
  }

  if (!structured) {
    logVerbose("[Agent] Semantic signal extraction returned no structured output.");
    return null;
  }

  return structured;
}

async function applyInboundSignalUpdates({
  dealId,
  dealProperties,
  body,
  logVerbose
}: {
  dealId: string;
  dealProperties: Record<string, any>;
  body?: string;
  logVerbose: (message: string) => void;
}): Promise<InboundSignalResult | null> {
  if (!body) return null;

  const updates: Record<string, string> = {};
  const semanticSignals = await extractInboundSignalsSemantic(body, logVerbose);

  if (semanticSignals) {
    const agents = coerceWholeNumber(semanticSignals.agents_required);
    if (agents && agents > 0 && !isPositiveNumber(dealProperties.agents_required)) {
      updates.agents_required = String(agents);
    }

    const ticketVolume = coerceWholeNumber(semanticSignals.ticket_volume_per_month);
    if (ticketVolume && ticketVolume > 0 && !isPositiveNumber(dealProperties.ticket_volume_per_month)) {
      updates.ticket_volume_per_month = String(ticketVolume);
    }

    const normalizedChannels = normalizeSupportChannels(semanticSignals.support_channels);
    if (normalizedChannels.length > 0) {
      const existingRaw = String(dealProperties.support_channels || "");
      const existing = existingRaw
        .split(";")
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean);
      const merged = Array.from(new Set([...existing, ...normalizedChannels]));
      updates.support_channels = merged.join("; ");
    }

    const primaryPain = sanitizeTextValue(semanticSignals.primary_pain);
    if (primaryPain && !dealProperties.sw_primary_pain) {
      updates.sw_primary_pain = primaryPain;
    }

    if (semanticSignals.key_challenges.length > 0) {
      const existing = String(dealProperties.key_challenges || "").trim();
      const existingParts = existing
        .split(";")
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean);
      const incoming = semanticSignals.key_challenges
        .map((value) => sanitizeTextValue(value))
        .filter((value): value is string => Boolean(value))
        .map((value) => value.toLowerCase());
      const merged = Array.from(new Set([...existingParts, ...incoming])).filter(Boolean);
      updates.key_challenges = merged.join("; ");
    }

    const timelineMs = parseUtcDate(semanticSignals.timeline.date_utc);
    if (timelineMs && !dealProperties.timeline_for_change) {
      updates.timeline_for_change = String(timelineMs);
    }
  } else {
    const agents = extractAgentsRequired(body);
    if (agents && !isPositiveNumber(dealProperties.agents_required)) {
      updates.agents_required = String(agents);
    }

    const timeline = extractTimelineForChange(body);
    if (timeline && !dealProperties.timeline_for_change) {
      updates.timeline_for_change = String(timeline);
    }

    const primaryPain = extractPrimaryPain(body);
    if (primaryPain && !dealProperties.sw_primary_pain) {
      updates.sw_primary_pain = primaryPain;
    }

    const ticketVolume = extractTicketVolumePerMonth(body);
    if (ticketVolume && !isPositiveNumber(dealProperties.ticket_volume_per_month)) {
      updates.ticket_volume_per_month = String(ticketVolume);
    }

    const challenge = extractKeyChallenge(body);
    if (challenge) {
      const existing = String(dealProperties.key_challenges || "").trim();
      if (!existing.toLowerCase().includes(challenge.toLowerCase())) {
        updates.key_challenges = existing ? `${existing}; ${challenge}` : challenge;
      }
    }
  }

  if (Object.keys(updates).length === 0) return semanticSignals;

  await updateDealProperties(dealId, updates);
  logVerbose(`[Agent] CRM updates from inbound signals: ${JSON.stringify(updates)}`);
  return semanticSignals;
}

/**
 * Run the sales agent.
 * 
 * This is a single SDK agent loop that:
 * 1. Handles pre-agent setup (contact/deal upsert)
 * 2. Runs one query() call with comprehensive system prompt
 * 3. Uses native Skills for prescribed behaviors
 * 4. Self-heals via prompting, not hard validators
 * 5. Persists session for resumption
 */
export async function runSalesAgent(explicitEvent?: AgentEvent): Promise<AgentResult> {
  loadEnv();
  const event = await resolveEvent(explicitEvent);
  const verbose = Boolean(event.verbose || process.env.VERBOSE_EVAL === "1");
  const disableResume = Boolean(event.disableResume || process.env.DISABLE_RESUME === "1");

  let contactId = event.contactId || null;
  let dealId = event.dealId || null;
  let sessionId: string | null = null;

  const logPrefix = event.logPrefix ? `${event.logPrefix} ` : "";
  const traceStream = event.traceFilePath && verbose
    ? (() => {
        const dir = dirname(event.traceFilePath);
        mkdirSync(dir, { recursive: true });
        return createWriteStream(event.traceFilePath, { flags: "a" });
      })()
    : null;

  const logVerbose = (message: string) => {
    if (!verbose) return;
    const line = `${new Date().toISOString()} ${logPrefix}${message}`;
    console.log(line);
    if (traceStream) {
      traceStream.write(`${line}\n`);
    }
  };

  // Pre-agent setup: contact/deal upsert (deterministic, no LLM)
  if (event.source === "new_inbound" || event.source === "reply_to_existing") {
    if (event.fromEmail) {
      logVerbose(`[Agent] Pre-LLM start (${event.source})`);
      const pre = await withTimeout(runPreLlm({ ...event, logEmail: true }), 30000, "runPreLlm");
      logVerbose(`[Agent] Pre-LLM complete`);
      contactId = pre.contactId;
      dealId = pre.dealId;
    }
  }

  if (dealId && !contactId) {
    logVerbose("[Agent] Fetch contact for deal");
    contactId = await withTimeout(getContactForDeal(dealId), 15000, "getContactForDeal");
  }

  if (!dealId) {
    throw new Error("dealId is required to run the sales agent");
  }

  // Fetch full deal context
  logVerbose("[Agent] Fetch deal context");
  const dealContext = await withTimeout(fetchDealContext(dealId), 30000, "fetchDealContext");

  const inboundSignals = await applyInboundSignalUpdates({
    dealId,
    dealProperties: dealContext.properties || {},
    body: event.body,
    logVerbose
  });

  // Get existing session ID for resumption
  sessionId = dealContext.properties?.session_id || null;

  // Build event context
  const eventContext: EventContext = {
    source: event.source as EventContext["source"],
    type: event.type,
    subject: event.subject,
    body: event.body,
    fromName: event.fromName,
    fromEmail: event.fromEmail
  };

  // Commitment reasoning (derived state + policy)
  logVerbose("[Agent] Fetch commitment artifacts");
  const artifacts = await withTimeout(fetchCommitmentArtifacts(dealId), 20000, "fetchCommitmentArtifacts");
  let derivedState: Awaited<ReturnType<typeof deriveCommitmentState>> | null = null;
  let nextActionPolicy: Awaited<ReturnType<typeof deriveNextActionPolicy>> | null = null;
  const shouldDeriveCommitment = true;
  try {
    if (shouldDeriveCommitment) {
      logVerbose("[Agent] Derive commitment state");
      derivedState = await withTimeout(deriveCommitmentState({
        dealId,
        dealSummary: dealContext.dealSummary,
        dealStageId: dealContext.dealStage,
        dealStageName: dealContext.dealStageName,
        artifacts,
        event: { subject: eventContext.subject, body: eventContext.body }
      }), 45000, "deriveCommitmentState");
    }
  } catch (error) {
    console.warn("[SalesAgent] Derived commitment state failed:", error);
  }
  if (!derivedState) {
    derivedState = {
      commitmentCurrent: dealContext.dealStage || "2130118129",
      commitmentEvidence: [],
      pricingIntent: "none",
      buyerIntent: "unknown",
      fatigueSignals: { present: false, rationale: "unknown" },
      recentAsks: [],
      unknowns: []
    };
  }

  if (!derivedState.fatigueSignals.present) {
    if (inboundSignals?.fatigue?.present) {
      derivedState.fatigueSignals = inboundSignals.fatigue;
      logVerbose(`[Agent] Fatigue override applied (semantic): ${inboundSignals.fatigue.rationale}`);
    } else if (eventContext.body) {
      const fatigueOverride = inferFatigueFromText(eventContext.body);
      if (fatigueOverride) {
        derivedState.fatigueSignals = fatigueOverride;
        logVerbose(`[Agent] Fatigue override applied (fallback): ${fatigueOverride.rationale}`);
      }
    }
  }

  try {
    logVerbose("[Agent] Derive next action policy");
    nextActionPolicy = await withTimeout(deriveNextActionPolicy({
      dealId,
      derivedState,
      dealSummary: dealContext.dealSummary,
      event: { subject: eventContext.subject, body: eventContext.body }
    }), 45000, "deriveNextActionPolicy");
  } catch (error) {
    console.warn("[SalesAgent] Next action policy failed:", error);
    nextActionPolicy = {
      mustAnswer: "Address the prospect's latest question or intent directly.",
      nextCommitment: derivedState.commitmentCurrent,
      minimalAsk: "If helpful, share one detail that would unblock next steps.",
      askStyle: "nurture",
      avoidTopics: [],
      pricingDirective: { required: derivedState.pricingIntent !== "none", skus: [], notes: null }
    };
  }

  const commitmentGap = computeCommitmentGap({
    currentStageId: dealContext.dealStage || derivedState.commitmentCurrent,
    properties: dealContext.properties || {},
    artifacts
  });
  dealContext.progressionGap = commitmentGap;

  const pricingSignal = derivedState.pricingIntent !== "none" ||
    /price|pricing|cost|budget|quote|invoice/i.test(`${eventContext.subject || ""} ${eventContext.body || ""}`);

  let pricingCatalogSummary = "";
  if (pricingSignal) {
    try {
      const catalogPath = resolve(process.cwd(), "data", "zendesk-products.json");
      const raw = readFileSync(catalogPath, "utf-8");
      const parsed = JSON.parse(raw) as { currency?: string; products?: Array<{ sku: string; name: string; price?: number; unit?: string; type?: string }> };
      const products = Array.isArray(parsed.products) ? parsed.products : [];
      const tiers = products.filter((p) => p.type === "plan").slice(0, 6);
      const lines = tiers.map((p) => `- ${p.name}: ${p.price ?? "N/A"} ${parsed.currency || "USD"} ${p.unit || ""}`.trim());
      if (lines.length > 0) {
        pricingCatalogSummary =
          `\n## Pricing Catalog Snapshot (Authoritative)\n` +
          `Use the local catalog data below for pricing. Do NOT use webReader or external URLs for pricing.\n` +
          `If you have not already done so, use the Read tool on data/zendesk-products.json before quoting.\n` +
          lines.join("\n") +
          `\n`;
      }
    } catch (error: any) {
      console.warn("[SalesAgent] Failed to build pricing catalog summary:", error?.message || error);
    }
  }

  const commitmentName = STAGE_NAMES[derivedState.commitmentCurrent] || derivedState.commitmentCurrent;
  const commitmentContext = `## Commitment State (Derived)\n` +
    `Current commitment: ${commitmentName} (${derivedState.commitmentCurrent})\n` +
    `Pricing intent: ${derivedState.pricingIntent}\n` +
    `Buyer intent: ${derivedState.buyerIntent}\n` +
    `Fatigue signals: ${derivedState.fatigueSignals.present ? "yes" : "no"} (${derivedState.fatigueSignals.rationale})\n` +
    `Recent asks: ${derivedState.recentAsks.length ? derivedState.recentAsks.join("; ") : "none"}\n` +
    `Unknowns: ${derivedState.unknowns.length ? derivedState.unknowns.join("; ") : "none"}\n` +
    `Artifacts: lineItems=${artifacts.lineItems}, invoiceStatus=${artifacts.invoiceStatus || "none"}, invoicePaid=${artifacts.invoicePaid}\n\n` +
    `## Next Action Policy\n` +
    `Must answer: ${nextActionPolicy.mustAnswer}\n` +
    `Next commitment: ${nextActionPolicy.nextCommitment}\n` +
    `Minimal ask: ${nextActionPolicy.minimalAsk}\n` +
    `Ask style: ${nextActionPolicy.askStyle}\n` +
    `Avoid topics: ${nextActionPolicy.avoidTopics.length ? nextActionPolicy.avoidTopics.join("; ") : "none"}\n` +
    `Pricing directive: ${nextActionPolicy.pricingDirective.required ? "required" : "not required"}${nextActionPolicy.pricingDirective.skus.length ? ` (SKUs: ${nextActionPolicy.pricingDirective.skus.join(", ")})` : ""}` +
    `${pricingCatalogSummary}`;

  // Build prompts
  const systemPrompt = buildSystemPrompt(dealContext, eventContext);
  const userPrompt = buildEventPrompt(eventContext);

  // Logging callbacks
  const toolCalls: Array<{ tool: string; input: any; timestamp: string }> = [];
  const toolResults: Array<{ tool: string; success: boolean; timestamp: string }> = [];
  const lastDraftRef: { current: EmailDraft | null } = { current: null };
  let stopObserved = false;
  let terminalAbort = false;
  let contractSentSignal: { invoiceId: string; invoiceLink: string } | null = null;
  const taskListId = process.env.CLAUDE_CODE_TASK_LIST_ID || dealId || "";
  const taskCache = new Map<string, { subject: string | null; description: string | null; status: string | null }>();
  const taskLifecycle: TaskLifecycleSummary[] = [];
  const mirrorJobs: Array<Promise<void>> = [];

  const updateTaskCache = (taskId: string, update: Partial<{ subject: string | null; description: string | null; status: string | null }>) => {
    const current = taskCache.get(taskId) || { subject: null, description: null, status: null };
    taskCache.set(taskId, { ...current, ...update });
  };

  const hydrateTaskFromDisk = (taskId: string) => {
    if (!taskListId) return;
    const summary = readTaskSummaryFromDisk(taskListId, taskId);
    if (summary && (summary.subject || summary.description)) {
      updateTaskCache(taskId, {
        subject: summary.subject ?? null,
        description: summary.description ?? null
      });
    }
  };

  const resolveTaskSummary = (taskId: string) => {
    const cached = taskCache.get(taskId);
    if (!cached || (!cached.subject && !cached.description)) {
      hydrateTaskFromDisk(taskId);
    }
    const resolved = taskCache.get(taskId);
    return {
      subject: resolved?.subject ?? null,
      description: resolved?.description ?? null
    };
  };

  const normalizeSdkStatus = (value: any): SdkTaskStatus | null => {
    if (value === "pending" || value === "in_progress" || value === "completed") return value;
    return null;
  };

  const captureTaskLifecycle = (entry: TaskLifecycleSummary) => {
    taskLifecycle.push(entry);
  };

  // Create enforcement state to ensure email responses are sent
  const enforcementState = createEnforcementState(event.source);
  enforcementState.pricingIntent = derivedState.pricingIntent;
  enforcementState.buyerIntent = derivedState.buyerIntent;
  enforcementState.recentAsks = derivedState.recentAsks;
  enforcementState.askStyle = nextActionPolicy.askStyle;
  enforcementState.fatigueSignals = derivedState.fatigueSignals;

  if (pricingSignal && !enforcementState.pricingCatalogRead) {
    const catalogPath = resolve(process.cwd(), "data", "zendesk-products.json");
    try {
      readFileSync(catalogPath, "utf-8");
      logVerbose(`[Agent] Pricing catalog snapshot loaded from ${catalogPath}`);
    } catch (error: any) {
      console.warn(`[SalesAgent] Pricing catalog not readable at ${catalogPath}:`, error?.message || error);
    }
  }

  const hooks = buildSalesAgentHooks({
    onToolCall: (tool, input) => {
      toolCalls.push({ tool, input, timestamp: new Date().toISOString() });
      logVerbose(`[Agent] Tool call: ${tool}${input ? ` ${JSON.stringify(input)}` : ""}`);
    },
    onToolResult: (tool, result, success, toolInput) => {
      toolResults.push({ tool, success, timestamp: new Date().toISOString() });
      logVerbose(`[Agent] Tool result: ${tool} success=${success}`);
      if (!success) return;

      if (tool === "TaskCreate") {
        const taskId = String(result?.task?.id ?? result?.data?.task?.id ?? result?.taskId ?? result?.id ?? "");
        if (taskId) {
          const subject = typeof result?.task?.subject === "string"
            ? result.task.subject
            : typeof toolInput?.subject === "string"
              ? toolInput.subject
              : null;
          const description = typeof toolInput?.description === "string" ? toolInput.description : null;
          updateTaskCache(taskId, { subject: subject ?? null, description, status: "pending" });
        }
        return;
      }

      if (tool === "TaskUpdate") {
        const taskId = String(toolInput?.taskId ?? result?.taskId ?? "");
        if (!taskId) return;

        const inputSubject = typeof toolInput?.subject === "string" ? toolInput.subject : null;
        const inputDescription = typeof toolInput?.description === "string" ? toolInput.description : null;
        if (inputSubject || inputDescription) {
          updateTaskCache(taskId, {
            subject: inputSubject ?? taskCache.get(taskId)?.subject ?? null,
            description: inputDescription ?? taskCache.get(taskId)?.description ?? null
          });
        }

        const statusTo = normalizeSdkStatus(result?.statusChange?.to ?? toolInput?.status);
        const statusFrom = result?.statusChange?.from ?? taskCache.get(taskId)?.status ?? null;
        if (statusTo) {
          updateTaskCache(taskId, { status: statusTo });
        }

        if (statusTo === "in_progress" || statusTo === "completed") {
          const { subject, description } = resolveTaskSummary(taskId);
          const summaryText = subject || `Task ${taskId}`;
          const lifecycleEntry: TaskLifecycleSummary = {
            taskId,
            subject,
            statusFrom: statusFrom ? String(statusFrom) : null,
            statusTo,
            timestamp: new Date().toISOString()
          };

          captureTaskLifecycle(lifecycleEntry);

          const mirrorJob = mirrorSdkTaskToHubSpot({
            dealId,
            sdkTaskId: taskId,
            sdkStatus: statusTo,
            summary: summaryText,
            description
          })
            .then((mirrorResult) => {
              lifecycleEntry.hubspotTaskId = mirrorResult.hubspotTaskId ?? null;
              lifecycleEntry.hubspotStatus = mirrorResult.hubspotStatus ?? null;
              lifecycleEntry.hubspotAction = mirrorResult.action;
              lifecycleEntry.error = mirrorResult.error ?? null;
            })
            .catch((error: any) => {
              lifecycleEntry.hubspotAction = "skipped";
              lifecycleEntry.error = error?.message || String(error);
            });

          mirrorJobs.push(mirrorJob);
        }
      }
    },
    onToolFailure: (tool, error, toolInput, toolUseId, isInterrupt) => {
      logVerbose(`[Agent] Tool failure: ${tool} ${isInterrupt ? "(interrupt)" : ""} ${error}`);
    },
    onEmailDraft: (draft) => {
      lastDraftRef.current = draft;
      logVerbose(`[Agent] Draft logged: "${draft.subject}" (${draft.body.length} chars)`);
    },
    onContractSent: (payload) => {
      contractSentSignal = payload;
      logVerbose(`[Agent] Contract sent: invoiceId=${payload.invoiceId}`);
    },
    onStop: (reason) => {
      stopObserved = true;
      logVerbose(`[SalesAgent] Stopped: ${reason}`);
    },
    onToolDecision: (toolName, decision, reason) => {
      logVerbose(`[Agent] Tool decision: ${toolName} -> ${decision}${reason ? ` (${reason})` : ""}`);
    },
    onNotification: (message, title) => {
      logVerbose(`[Agent] Notification${title ? `: ${title}` : ""} ${message}`);
    },
    enforcementState,
    additionalContext: commitmentContext
  });

  // Create MCP server
  const mcpServers = { "sales-crm": createSalesMcpServer() };

  // Run the agent with timeout management
  const QUERY_TIMEOUT_MS = 300000; // 5 minutes
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
    console.error(`[SalesAgent] Query timed out after ${QUERY_TIMEOUT_MS}ms`);
  }, QUERY_TIMEOUT_MS);

  let resultSessionId: string | null = sessionId;
  let agentError: string | null = null;
  let successResult = false;
  let summaryRefreshed = false;

  try {
    const queryEnv = getClaudeEnv();
    if (taskListId && !queryEnv.CLAUDE_CODE_TASK_LIST_ID) {
      queryEnv.CLAUDE_CODE_TASK_LIST_ID = taskListId;
    }

    const queryOptions = {
      model: "opus",
      resume: disableResume ? undefined : sessionId || undefined,
      executable: "bun",
      pathToClaudeCodeExecutable: getClaudeCodePath(),
      env: queryEnv,
      systemPrompt: { type: "preset" as const, preset: "claude_code" as const, append: systemPrompt },
      settingSources: ["user", "project"] as any,
      allowedTools: ALLOWED_TOOLS,
      mcpServers,
      agents: SALES_SUBAGENTS,
      hooks,
      allowDangerouslySkipPermissions: true,
      permissionMode: "bypassPermissions" as const,  // Fully autonomous - no permission prompts
      abortController: controller,
      includePartialMessages: verbose,
      maxThinkingTokens: verbose ? 1024 : undefined,
      stderr: verbose
        ? (data: string) => {
            const lines = String(data).split(/\r?\n/).filter(Boolean);
            for (const line of lines) {
              logVerbose(`[Agent][stderr] ${line}`);
            }
          }
        : undefined
    };

    let planSummary: any = null;
    let judgeSummary: any = null;
    let executionSummary: any = null;
    let toolUsage: any = null;

    logVerbose("[Agent] Query loop start");
    for await (const message of query({
      prompt: buildStreamingPrompt(userPrompt, { sessionId }),
      options: queryOptions as any
    }) as any) {
      // Capture session ID
      if (message.type === "system" && message.subtype === "init") {
        resultSessionId = message.session_id || resultSessionId;
        logVerbose(`[Agent] Session init: ${resultSessionId}`);
      }

      if (message.type === "summary") {
        const m = message as any;
        if (m.subtype === "plan") {
          planSummary = buildPlanSummary(m.summary);
          logVerbose(`[Agent] Plan summary: ${JSON.stringify(planSummary)}`);
        }
        if (m.subtype === "judge") {
          judgeSummary = buildJudgeSummary(m.summary);
          logVerbose(`[Agent] Judge summary: ${JSON.stringify(judgeSummary)}`);
        }
        if (m.subtype === "execution") {
          executionSummary = buildExecutionSummary(m.summary);
          logVerbose(`[Agent] Execution summary: ${JSON.stringify(executionSummary)}`);
        }
        if (m.subtype === "tool_usage") {
          toolUsage = m.summary;
          logVerbose(`[Agent] Tool usage summary: ${JSON.stringify(toolUsage)}`);
        }
      }

      if (message.type === "assistant" && (message as any).message?.content && verbose) {
        const content = (message as any).message?.content;
        const blocks = Array.isArray(content) ? content : [content];
        const text = blocks
          .filter((block: any) => block?.type === "text" && typeof block?.text === "string")
          .map((block: any) => block.text)
          .join("")
          .trim();
        if (text) logVerbose(`[Agent] Assistant: ${text.slice(0, 500)}`);
      }

      if (message.type === "stream_event" && verbose) {
        const event = (message as any).event;
        const eventType = event?.type || "unknown";
        if (eventType === "content_block_start") {
          const blockType = event?.content_block?.type || "unknown";
          logVerbose(`[Agent] Stream block start: ${blockType}`);
        } else if (eventType === "content_block_delta") {
          const delta = event?.delta;
          if ((delta?.type === "text" || delta?.type === "text_delta") && typeof delta?.text === "string") {
            logVerbose(`[Agent] Stream text delta: ${delta.text.slice(0, 300)}`);
          } else if ((delta?.type === "thinking" || delta?.type === "thinking_delta") && typeof delta?.thinking === "string") {
            logVerbose(`[Agent] Stream thinking delta (${delta.thinking.length} chars)`);
          } else {
            logVerbose(`[Agent] Stream delta: ${JSON.stringify(delta).slice(0, 300)}`);
          }
        } else if (eventType === "content_block_stop") {
          logVerbose("[Agent] Stream block stop");
        } else {
          logVerbose(`[Agent] Stream event: ${eventType}`);
        }
      }

      // Check for result
      if (message.type === "result") {
        if (verbose) {
          logVerbose(`[Agent] Result: ${message.subtype}`);
        }
        if (message.subtype === "success") {
          // Agent completed successfully
          successResult = true;
        } else if (message.subtype === "error_max_turns") {
          agentError = "Agent reached maximum turns";
        } else if (message.errors && message.errors.length > 0) {
          agentError = message.errors.join("; ");
        }
      }

      if (contractSentSignal && !terminalAbort) {
        try {
          await updateDealProperties(dealId, { dealstage: "contractsent" });
          console.log("[SalesAgent] Terminal stage reached: contractsent");
        } catch (error: any) {
          console.error("[SalesAgent] Failed to mark contractsent:", error.message || error);
        }
        terminalAbort = true;
        successResult = true;
        controller.abort();
      }
    }

    if (mirrorJobs.length > 0) {
      try {
        const timeout = new Promise((resolve) => setTimeout(resolve, 5000, "timeout"));
        const settled = await Promise.race([Promise.allSettled(mirrorJobs), timeout]);
        if (settled === "timeout") {
          console.warn("[SalesAgent] HubSpot task mirror timed out; continuing");
        }
      } catch (error: any) {
        console.warn("[SalesAgent] HubSpot task mirror failed:", error?.message || error);
      }
    }

    if (dealId && taskLifecycle.length > 0) {
      try {
        const latestStatuses = new Map<string, SdkTaskStatus>();
        for (const event of taskLifecycle) {
          const status = normalizeSdkStatus(event.statusTo);
          if (status) latestStatuses.set(event.taskId, status);
        }
        const expected = Array.from(latestStatuses.entries()).map(([taskId, status]) => ({ taskId, status }));
        const validation = await validateTaskMirror({ dealId, expected });
        if (validation.missing.length > 0 || validation.mismatched.length > 0) {
          console.warn("[SalesAgent] HubSpot task mirror validation issues:", JSON.stringify(validation));
        }
      } catch (error: any) {
        console.warn("[SalesAgent] HubSpot task mirror validation failed:", error?.message || error);
      }
    }

    const requiresEmail = ["new_inbound", "reply_to_existing"].includes(event.source);
    if (requiresEmail && !enforcementState.emailLogged) {
      agentError = "Agent stopped without logging an email draft";
      successResult = false;
    }

    // Log Run Note
    try {
      const note = await createRunNote({
        source: event.source,
        dealId,
        contactId,
        sessionId: resultSessionId,
        blockingArtifact: null,
        planSummary,
        judgeSummary,
        executionSummary,
        taskLifecycle,
        toolUsage,
        systemPromptAppend: systemPrompt
      });
      appendRunNote(note);
    } catch (e) {
      console.error("[SalesAgent] Failed to create run note:", e);
    }

    let updatedSummary: any = null;

    if (stopObserved && successResult && !summaryRefreshed) {
      try {
        const dealSummaryResult = await generateDealSummary({
          dealId,
          stageContext: { progressionGap: commitmentGap, derivedState },
          sessionId: resultSessionId,
          systemPromptAppend: systemPrompt
        });
        updatedSummary = dealSummaryResult.summary;
        await updateDealSummary(dealId, dealSummaryResult.summary);
        summaryRefreshed = true;
        console.log("[SalesAgent] Deal summary refreshed");
      } catch (e) {
        console.error("[SalesAgent] Failed to refresh deal summary:", e);
      }
    } else if (!successResult) {
      console.log("[SalesAgent] Deal summary refresh skipped (unsuccessful run)");
    }

    if (successResult) {
      try {
        const propertiesForStage = await fetchStageProperties(dealId);
        const artifactsForStage = await fetchCommitmentArtifacts(dealId);
        const invoiceLink = enforcementState.lastInvoiceLink || artifactsForStage.invoiceLink;
        const lastDraftSnapshot = lastDraftRef.current;
        const draftEvidence = lastDraftSnapshot
          ? await evaluateDraftEvidence({ draft: { subject: lastDraftSnapshot.subject, body: lastDraftSnapshot.body }, invoiceLink })
          : null;

        let derivedStateForAdvance = derivedState;
        if (updatedSummary) {
          try {
            derivedStateForAdvance = await deriveCommitmentState({
              dealId,
              dealSummary: updatedSummary,
              dealStageId: propertiesForStage.dealstage,
              dealStageName: STAGE_NAMES[String(propertiesForStage.dealstage || "")],
              artifacts: artifactsForStage,
              event: { subject: eventContext.subject, body: eventContext.body }
            });
          } catch (error) {
            console.warn("[SalesAgent] Commitment stage advance derivation failed:", error);
            derivedStateForAdvance = derivedState;
          }
        }

        const requireDraftForAdvance = ["new_inbound", "reply_to_existing"].includes(event.source);
        const stageAdvance = await advanceCommitmentStage({
          dealId,
          currentStageId: String(propertiesForStage.dealstage || dealContext.dealStage || derivedStateForAdvance.commitmentCurrent),
          derivedState: derivedStateForAdvance,
          properties: propertiesForStage,
          artifacts: { ...artifactsForStage, invoiceLink },
          draftEvidence,
          pricingCatalogRead: enforcementState.pricingCatalogRead,
          requireDraftForAdvance,
          lastDraft: lastDraftSnapshot ? { subject: lastDraftSnapshot.subject, body: lastDraftSnapshot.body } : null
        });

        if (stageAdvance.blockedReason) {
          console.log(`[SalesAgent] Stage advance blocked: ${stageAdvance.blockedReason}`);
        } else if (stageAdvance.advanced) {
          console.log(`[SalesAgent] Stage advanced: ${stageAdvance.from?.name} -> ${stageAdvance.to?.name}`);
        }
      } catch (e) {
        console.error("[SalesAgent] Commitment stage advance failed:", e);
      }
    }
  } catch (error: any) {
    if (terminalAbort && String(error?.name || "").toLowerCase() === "aborted") {
      agentError = null;
    } else if (terminalAbort && String(error?.message || "").toLowerCase().includes("abort")) {
      agentError = null;
    } else {
      agentError = error.message || "Unknown error";
    }
  } finally {
    clearTimeout(timeout);
    if (traceStream) {
      traceStream.end();
    }
  }

  // Persist session ID
  if (resultSessionId && dealId) {
    await persistSession(dealId, resultSessionId);
  }

  const result: AgentResult = {
    success: !agentError,
    dealId,
    contactId,
    sessionId: resultSessionId,
    lastDraft: lastDraftRef.current,
    error: agentError || undefined
  };

  console.log(JSON.stringify(result, null, 2));
  return result;
}

function isMainModule(): boolean {
  if (!process.argv[1]) return false;
  const entry = resolve(process.argv[1]);
  const current = resolve(fileURLToPath(import.meta.url));
  return entry === current;
}

if (isMainModule()) {
  runSalesAgent().catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  });
}
