import { query } from "@anthropic-ai/claude-agent-sdk";
import { fileURLToPath } from "url";
import { resolve, dirname } from "path";
import { readFileSync, createWriteStream, mkdirSync } from "fs";
import { loadEnv } from "../lib/env";
import { runPreLlm } from "./preLlm";
import { fetchDealProperties, updateDealProperties, fetchDealEngagements, hubspotRequest, createDealNote } from "../lib/hubspot";
import { createSalesMcpServer } from "../tools/mcp";
import { getClaudeCodePath, getClaudeEnv } from "./claude";
import { buildSystemPrompt, buildEventPrompt, type DealContext, type EventContext } from "./systemPrompt";
import { buildSalesAgentHooks, createEnforcementState, type EnforcementState } from "./hooks";
import { STAGE_NAMES } from "../config/dealStage";
import { createRunNote, appendRunNote, buildPlanSummary, buildJudgeSummary, buildExecutionSummary, type TaskLifecycleSummary } from "./runNotes";
import { buildStreamingPrompt } from "./promptStream";
import { generateDealSummary, updateDealSummary } from "./summary";
import { deriveCommitmentState, deriveNextActionPolicy, fetchCommitmentArtifacts, evaluateDraftEvidence } from "./commitment";
import { advanceCommitmentStage, computeCommitmentGap, fetchStageProperties } from "./commitmentStage";
import { mirrorSdkTaskToHubSpot, readTaskSummaryFromDisk, validateTaskMirror, type SdkTaskStatus } from "./taskMirror";
import { extractInboundSignalsSemantic, type InboundSignalResult } from "./inboundSignals";
import { createTelemetryLogger } from "./telemetry";

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
  noResponseNeeded?: boolean;
  noResponseReason?: string;
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


function parseUtcDate(value: string | null): number | null {
  if (!value || typeof value !== "string") return null;
  const parsed = Date.parse(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed)) return null;
  const asDate = new Date(parsed);
  return Date.UTC(asDate.getUTCFullYear(), asDate.getUTCMonth(), asDate.getUTCDate());
}

function coerceWholeNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
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
  if (["null", "none", "n/a", "na", "unknown", "not provided", "not applicable"].includes(lower)) {
    return null;
  }
  if (lower.startsWith("none ") || lower.startsWith("none-") || lower.startsWith("none:")) {
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

async function applyInboundSignalUpdates({
  dealId,
  dealProperties,
  body,
  logVerbose,
  enforcementState
}: {
  dealId: string;
  dealProperties: Record<string, any>;
  body?: string;
  logVerbose: (message: string) => void;
  enforcementState?: EnforcementState;
}): Promise<InboundSignalResult | null> {
  if (!body) return null;

  const updates: Record<string, string> = {};
  const invalidZeros: string[] = [];
  const semanticSignals = await extractInboundSignalsSemantic(body, logVerbose);

  if (!semanticSignals) {
    throw new Error("Semantic extraction failed or timed out; blocking turn to avoid missing CRM updates.");
  }

  const agents = coerceWholeNumber(semanticSignals.agents_required);
  if (agents === 0) {
    invalidZeros.push("agents_required");
  }
  if (agents !== null && !isPositiveNumber(dealProperties.agents_required)) {
    if (agents > 0) {
      updates.agents_required = String(agents);
    }
  }

  const ticketVolume = coerceWholeNumber(semanticSignals.ticket_volume_per_month);
  if (ticketVolume === 0) {
    invalidZeros.push("ticket_volume_per_month");
  }
  if (ticketVolume !== null && !isPositiveNumber(dealProperties.ticket_volume_per_month)) {
    if (ticketVolume > 0) {
      updates.ticket_volume_per_month = String(ticketVolume);
    }
  }

  const rawChannels = Array.isArray(semanticSignals.support_channels)
    ? semanticSignals.support_channels
    : typeof semanticSignals.support_channels === "string"
      ? [semanticSignals.support_channels]
      : [];
  const normalizedChannels = normalizeSupportChannels(rawChannels);
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

  const incomingChallenges = Array.isArray(semanticSignals.key_challenges)
    ? semanticSignals.key_challenges
    : typeof semanticSignals.key_challenges === "string"
      ? [semanticSignals.key_challenges]
      : [];
  if (incomingChallenges.length > 0) {
    const existing = String(dealProperties.key_challenges || "").trim();
    const existingParts = existing
      .split(";")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean);
    const incoming = incomingChallenges
      .map((value) => sanitizeTextValue(value))
      .filter((value): value is string => Boolean(value))
      .map((value) => value.toLowerCase());
    const merged = Array.from(new Set([...existingParts, ...incoming])).filter(Boolean);
    updates.key_challenges = merged.join("; ");
  }

  const timelineDate = semanticSignals.timeline_date_utc;
  const timelineMs = parseUtcDate(timelineDate);
  if (timelineMs && !dealProperties.timeline_for_change) {
    updates.timeline_for_change = String(timelineMs);
  }

  if (invalidZeros.length > 0 && enforcementState) {
    enforcementState.invalidInboundZeros = invalidZeros;
    logVerbose(`[Agent] Inbound signal validation blocked zero values: ${invalidZeros.join(", ")}`);
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
  const telemetryRunId = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const telemetryPath = resolve(process.cwd(), "data", "run-telemetry", `${telemetryRunId}.jsonl`);
  const telemetry = createTelemetryLogger({
    filePath: telemetryPath,
    defaults: {
      runId: telemetryRunId
    }
  });

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

  telemetry.log({
    event_type: "agent_start",
    payload: {
      source: event.source,
      type: event.type,
      fromEmail: event.fromEmail,
      fromName: event.fromName,
      dealId: event.dealId,
      contactId: event.contactId,
      resumeOnly: event.resumeOnly,
      verbose
    }
  });

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
      telemetry.log({
        event_type: "pre_llm_start",
        payload: { source: event.source }
      });
      const pre = await withTimeout(runPreLlm({ ...event, logEmail: true }), 30000, "runPreLlm");
      logVerbose(`[Agent] Pre-LLM complete`);
      telemetry.log({
        event_type: "pre_llm_complete",
        payload: { contactId: pre.contactId, dealId: pre.dealId }
      });
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
  telemetry.log({
    event_type: "deal_context_fetched",
    dealId,
    payload: { dealStage: dealContext.dealStage }
  });

  const enforcementState = createEnforcementState(event.source);

  const inboundSignals = await applyInboundSignalUpdates({
    dealId,
    dealProperties: dealContext.properties || {},
    body: event.body,
    logVerbose,
    enforcementState
  });
  telemetry.log({
    event_type: "inbound_signals",
    dealId,
    payload: inboundSignals ? inboundSignals : { present: false }
  });

  if (event.source === "reply_to_existing" && inboundSignals?.no_response_needed) {
    const reason = inboundSignals.no_response_reason || "Model classified acknowledgement-only reply.";
    try {
      await createDealNote(dealId, `No response needed. ${reason}`);
    } catch (error: any) {
      console.warn("[SalesAgent] Failed to log no-response note:", error?.message || error);
      telemetry.log({
        event_type: "no_response_note_error",
        dealId,
        payload: { error: error?.message || String(error) }
      });
    }
    telemetry.log({
      event_type: "no_response_needed",
      dealId,
      payload: { reason }
    });

    return {
      success: true,
      dealId,
      contactId,
      sessionId,
      lastDraft: null,
      noResponseNeeded: true,
      noResponseReason: reason
    };
  }

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
      }), 120000, "deriveCommitmentState");
      telemetry.log({
        event_type: "commitment_derived",
        dealId,
        payload: derivedState as any
      });
    }
  } catch (error) {
    console.warn("[SalesAgent] Derived commitment state failed:", error);
    telemetry.log({
      event_type: "commitment_derive_error",
      dealId,
      payload: { error: (error as any)?.message || String(error) }
    });
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
    if (inboundSignals?.fatigue_present) {
      derivedState.fatigueSignals = {
        present: inboundSignals.fatigue_present,
        rationale: inboundSignals.fatigue_rationale || "Captured from inbound signals."
      };
      logVerbose(`[Agent] Fatigue override applied (semantic): ${derivedState.fatigueSignals.rationale}`);
    }
  }

  try {
    logVerbose("[Agent] Derive next action policy");
    nextActionPolicy = await withTimeout(deriveNextActionPolicy({
      dealId,
      derivedState,
      dealSummary: dealContext.dealSummary,
      event: { subject: eventContext.subject, body: eventContext.body }
    }), 120000, "deriveNextActionPolicy");
    telemetry.log({
      event_type: "next_action_policy",
      dealId,
      payload: nextActionPolicy as any
    });
  } catch (error) {
    console.warn("[SalesAgent] Next action policy failed:", error);
    telemetry.log({
      event_type: "next_action_policy_error",
      dealId,
      payload: { error: (error as any)?.message || String(error) }
    });
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
  enforcementState.progressionGap = commitmentGap;

  const pricingSignal =
    derivedState.pricingIntent !== "none" ||
    (inboundSignals?.pricing_intent && inboundSignals.pricing_intent !== "none");

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
    `${nextActionPolicy.minimalAsk.includes("disengage") ? "\n\nCRITICAL: DO NOT ASK QUESTIONS. The prospect is fatigued/disengaging. Send a polite closing statement ONLY." : ""}` +
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
    if (value === "pending" || value === "in_progress" || value === "completed" || value === "deleted") return value;
    return null;
  };

  const captureTaskLifecycle = (entry: TaskLifecycleSummary) => {
    taskLifecycle.push(entry);
  };

  // Configure enforcement state to ensure email responses are sent
  enforcementState.pricingIntent = inboundSignals?.pricing_intent ?? derivedState.pricingIntent;
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
      telemetry.log({
        event_type: "tool_call",
        dealId,
        sessionId,
        payload: { tool, input }
      });
    },
    onToolResult: (tool, result, success, toolInput) => {
      toolResults.push({ tool, success, timestamp: new Date().toISOString() });
      logVerbose(`[Agent] Tool result: ${tool} success=${success}`);
      telemetry.log({
        event_type: "tool_result",
        dealId,
        sessionId,
        payload: { tool, success, result, toolInput }
      });
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

        if (statusTo === "deleted") {
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
          taskCache.delete(taskId);
          return;
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
      telemetry.log({
        event_type: "tool_failure",
        dealId,
        sessionId,
        payload: { tool, error, toolInput, toolUseId, isInterrupt }
      });
    },
    onEmailDraft: (draft) => {
      lastDraftRef.current = draft;
      logVerbose(`[Agent] Draft logged: "${draft.subject}" (${draft.body.length} chars)`);
      telemetry.log({
        event_type: "email_draft",
        dealId,
        sessionId,
        payload: { subject: draft.subject, body: draft.body, emailId: draft.emailId }
      });
    },
    onContractSent: (payload) => {
      contractSentSignal = payload;
      logVerbose(`[Agent] Contract sent: invoiceId=${payload.invoiceId}`);
      telemetry.log({
        event_type: "contract_sent",
        dealId,
        sessionId,
        payload
      });
    },
    onStop: (reason) => {
      stopObserved = true;
      logVerbose(`[SalesAgent] Stopped: ${reason}`);
      telemetry.log({
        event_type: "agent_stop",
        dealId,
        sessionId,
        payload: { reason }
      });
    },
    onToolDecision: (toolName, decision, reason) => {
      logVerbose(`[Agent] Tool decision: ${toolName} -> ${decision}${reason ? ` (${reason})` : ""}`);
      telemetry.log({
        event_type: "tool_decision",
        dealId,
        sessionId,
        payload: { toolName, decision, reason }
      });
    },
    onNotification: (message, title) => {
      logVerbose(`[Agent] Notification${title ? `: ${title}` : ""} ${message}`);
      telemetry.log({
        event_type: "notification",
        dealId,
        sessionId,
        payload: { message, title }
      });
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
    if (!queryEnv.CLAUDE_CODE_ENABLE_TASKS) {
      queryEnv.CLAUDE_CODE_ENABLE_TASKS = "true";
    }
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
    let streamBlockType: string | null = null;
    let streamTextChars = 0;
    let streamThinkingChars = 0;
    let streamDeltaCount = 0;
    let streamFirstTextSample: string | null = null;
    let streamLastTextSample: string | null = null;

    const flushStreamSummary = (reason: string) => {
      if (!streamBlockType) return;
      const summary = {
        blockType: streamBlockType,
        deltas: streamDeltaCount,
        textChars: streamTextChars,
        thinkingChars: streamThinkingChars,
        reason
      };
      logVerbose(
        `[Agent] Stream block stop: ${summary.blockType} (deltas=${summary.deltas}, textChars=${summary.textChars}, thinkingChars=${summary.thinkingChars})`
      );
      if (streamFirstTextSample) {
        logVerbose(`[Agent] Stream text sample (first): ${streamFirstTextSample}`);
      }
      if (streamLastTextSample && streamLastTextSample !== streamFirstTextSample) {
        logVerbose(`[Agent] Stream text sample (last): ${streamLastTextSample}`);
      }
      telemetry.log({
        event_type: "stream_block_summary",
        dealId,
        sessionId: resultSessionId,
        payload: summary
      });

      streamBlockType = null;
      streamTextChars = 0;
      streamThinkingChars = 0;
      streamDeltaCount = 0;
      streamFirstTextSample = null;
      streamLastTextSample = null;
    };

    logVerbose("[Agent] Query loop start");
    for await (const message of query({
      prompt: buildStreamingPrompt(userPrompt, { sessionId }),
      options: queryOptions as any
    }) as any) {
      // Capture session ID
      if (message.type === "system" && message.subtype === "init") {
        resultSessionId = message.session_id || resultSessionId;
        logVerbose(`[Agent] Session init: ${resultSessionId}`);
        telemetry.log({
          event_type: "session_init",
          dealId,
          sessionId: resultSessionId,
          payload: { sessionId: resultSessionId }
        });
      }

      if (message.type === "summary") {
        const m = message as any;
        if (m.subtype === "plan") {
          planSummary = buildPlanSummary(m.summary);
          logVerbose(`[Agent] Plan summary: ${JSON.stringify(planSummary)}`);
          telemetry.log({
            event_type: "summary_plan",
            dealId,
            sessionId: resultSessionId,
            payload: planSummary
          });
        }
        if (m.subtype === "judge") {
          judgeSummary = buildJudgeSummary(m.summary);
          logVerbose(`[Agent] Judge summary: ${JSON.stringify(judgeSummary)}`);
          telemetry.log({
            event_type: "summary_judge",
            dealId,
            sessionId: resultSessionId,
            payload: judgeSummary
          });
        }
        if (m.subtype === "execution") {
          executionSummary = buildExecutionSummary(m.summary);
          logVerbose(`[Agent] Execution summary: ${JSON.stringify(executionSummary)}`);
          telemetry.log({
            event_type: "summary_execution",
            dealId,
            sessionId: resultSessionId,
            payload: executionSummary
          });
        }
        if (m.subtype === "tool_usage") {
          toolUsage = m.summary;
          logVerbose(`[Agent] Tool usage summary: ${JSON.stringify(toolUsage)}`);
          telemetry.log({
            event_type: "summary_tool_usage",
            dealId,
            sessionId: resultSessionId,
            payload: toolUsage
          });
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
        telemetry.log({
          event_type: "assistant_message",
          dealId,
          sessionId: resultSessionId,
          payload: { text, length: text.length }
        });
      }

      if (message.type === "stream_event" && verbose) {
        const event = (message as any).event;
        const eventType = event?.type || "unknown";
        if (eventType === "content_block_start") {
          const blockType = event?.content_block?.type || "unknown";
          flushStreamSummary("new_block_start");
          streamBlockType = blockType;
          logVerbose(`[Agent] Stream block start: ${blockType}`);
          telemetry.log({
            event_type: "stream_block_start",
            dealId,
            sessionId: resultSessionId,
            payload: { blockType }
          });
        } else if (eventType === "content_block_delta") {
          const delta = event?.delta;
          streamDeltaCount += 1;
          if (!streamBlockType) streamBlockType = "unknown";
          if ((delta?.type === "text" || delta?.type === "text_delta") && typeof delta?.text === "string") {
            streamTextChars += delta.text.length;
            if (!streamFirstTextSample) streamFirstTextSample = delta.text.slice(0, 160);
            streamLastTextSample = delta.text.slice(0, 160);
          } else if ((delta?.type === "thinking" || delta?.type === "thinking_delta") && typeof delta?.thinking === "string") {
            streamThinkingChars += delta.thinking.length;
          }
        } else if (eventType === "content_block_stop") {
          flushStreamSummary("block_stop");
        } else {
          logVerbose(`[Agent] Stream event: ${eventType}`);
          telemetry.log({
            event_type: "stream_event",
            dealId,
            sessionId: resultSessionId,
            payload: { eventType }
          });
        }
      }

      // Check for result
      if (message.type === "result") {
        flushStreamSummary("result");
        if (verbose) {
          logVerbose(`[Agent] Result: ${message.subtype}`);
        }
        if (message.subtype === "success") {
          // Agent completed successfully
          successResult = true;
          telemetry.log({
            event_type: "result_success",
            dealId,
            sessionId: resultSessionId
          });
        } else if (message.subtype === "error_max_turns") {
          agentError = "Agent reached maximum turns";
          telemetry.log({
            event_type: "result_error",
            dealId,
            sessionId: resultSessionId,
            payload: { error: agentError }
          });
        } else if (message.errors && message.errors.length > 0) {
          agentError = message.errors.join("; ");
          telemetry.log({
            event_type: "result_error",
            dealId,
            sessionId: resultSessionId,
            payload: { error: agentError }
          });
        }
      }

      if (contractSentSignal && !terminalAbort) {
        try {
          await updateDealProperties(dealId, { dealstage: "contractsent" });
          console.log("[SalesAgent] Terminal stage reached: contractsent");
        } catch (error: any) {
          console.error("[SalesAgent] Failed to mark contractsent:", error.message || error);
          telemetry.log({
            event_type: "terminal_stage_error",
            dealId,
            sessionId: resultSessionId,
            payload: { error: error?.message || String(error) }
          });
        }
        terminalAbort = true;
        successResult = true;
        controller.abort();
      }
    }
    logVerbose("[Agent] Query loop end");

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
      telemetry.log({
        event_type: "agent_error",
        dealId,
        sessionId: resultSessionId,
        payload: { error: agentError }
      });
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
        telemetry.log({
          event_type: "run_note_error",
          dealId,
          sessionId: resultSessionId,
          payload: { error: (e as any)?.message || String(e) }
        });
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
        telemetry.log({
          event_type: "summary_refresh_error",
          dealId,
          sessionId: resultSessionId,
          payload: { error: (e as any)?.message || String(e) }
        });
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
          telemetry.log({
            event_type: "stage_advance_blocked",
            dealId,
            sessionId: resultSessionId,
            payload: { reason: stageAdvance.blockedReason }
          });
        } else if (stageAdvance.advanced) {
          console.log(`[SalesAgent] Stage advanced: ${stageAdvance.from?.name} -> ${stageAdvance.to?.name}`);
          telemetry.log({
            event_type: "stage_advanced",
            dealId,
            sessionId: resultSessionId,
            payload: { from: stageAdvance.from, to: stageAdvance.to }
          });
        }
      } catch (e) {
        console.error("[SalesAgent] Commitment stage advance failed:", e);
        telemetry.log({
          event_type: "stage_advance_error",
          dealId,
          sessionId: resultSessionId,
          payload: { error: (e as any)?.message || String(e) }
        });
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
    if (agentError) {
      telemetry.log({
        event_type: "agent_error",
        dealId,
        sessionId: resultSessionId,
        payload: { error: agentError }
      });
    }
  } finally {
    clearTimeout(timeout);
    if (traceStream) {
      traceStream.end();
    }
    telemetry.log({
      event_type: "agent_end",
      dealId,
      sessionId: resultSessionId,
      payload: { success: !agentError, error: agentError || null }
    });
    telemetry.flushAndClose();
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
