import { query } from "@anthropic-ai/claude-agent-sdk";
import { fileURLToPath } from "url";
import { resolve } from "path";
import { loadEnv } from "../lib/env";
import { runPreLlm } from "./preLlm";
import { fetchDealProperties, updateDealProperties, fetchDealEngagements, hubspotRequest } from "../lib/hubspot";
import { createSalesMcpServer } from "../tools/mcp";
import { getClaudeCodePath, getClaudeEnv } from "./claude";
import { buildSystemPrompt, buildEventPrompt, type DealContext, type EventContext } from "./systemPrompt";
import { buildSalesAgentHooks, createEnforcementState } from "./hooks";
import { STAGE_NAMES } from "../config/dealStage";
import { createRunNote, appendRunNote, buildPlanSummary, buildJudgeSummary, buildExecutionSummary, type TaskLifecycleSummary } from "./runNotes";
import { buildStreamingPrompt } from "./promptStream";
import { generateDealSummary, updateDealSummary } from "./summary";
import { deriveCommitmentState, deriveNextActionPolicy, fetchCommitmentArtifacts, evaluateDraftEvidence } from "./commitment";
import { advanceCommitmentStage, computeCommitmentGap, fetchStageProperties } from "./commitmentStage";
import { mirrorSdkTaskToHubSpot, readTaskSummaryFromDisk, validateTaskMirror, type SdkTaskStatus } from "./taskMirror";

const MCP_PREFIX = "mcp__sales-crm__";

// Tools the agent can use (fully autonomous - no human escalation tools)
const ALLOWED_TOOLS = [
  "Skill",
  "Task",
  "TaskCreate",
  "TaskUpdate",
  "TaskList",
  "TaskGet",
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

  let contactId = event.contactId || null;
  let dealId = event.dealId || null;
  let sessionId: string | null = null;

  // Pre-agent setup: contact/deal upsert (deterministic, no LLM)
  if (event.source === "new_inbound" || event.source === "reply_to_existing") {
    if (event.fromEmail) {
      const pre = await runPreLlm({ ...event, logEmail: true });
      contactId = pre.contactId;
      dealId = pre.dealId;
    }
  }

  if (dealId && !contactId) {
    contactId = await getContactForDeal(dealId);
  }

  if (!dealId) {
    throw new Error("dealId is required to run the sales agent");
  }

  // Fetch full deal context
  const dealContext = await fetchDealContext(dealId);

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
  const artifacts = await fetchCommitmentArtifacts(dealId);
  let derivedState: Awaited<ReturnType<typeof deriveCommitmentState>> | null = null;
  let nextActionPolicy: Awaited<ReturnType<typeof deriveNextActionPolicy>> | null = null;
  try {
    derivedState = await deriveCommitmentState({
      dealId,
      dealSummary: dealContext.dealSummary,
      dealStageId: dealContext.dealStage,
      dealStageName: dealContext.dealStageName,
      artifacts,
      event: { subject: eventContext.subject, body: eventContext.body }
    });
  } catch (error) {
    console.warn("[SalesAgent] Derived commitment state failed:", error);
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

  try {
    nextActionPolicy = await deriveNextActionPolicy({
      dealId,
      derivedState,
      dealSummary: dealContext.dealSummary,
      event: { subject: eventContext.subject, body: eventContext.body }
    });
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
    `Pricing directive: ${nextActionPolicy.pricingDirective.required ? "required" : "not required"}${nextActionPolicy.pricingDirective.skus.length ? ` (SKUs: ${nextActionPolicy.pricingDirective.skus.join(", ")})` : ""}`;

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

  const hooks = buildSalesAgentHooks({
    onToolCall: (tool, input) => {
      toolCalls.push({ tool, input, timestamp: new Date().toISOString() });
    },
    onToolResult: (tool, result, success, toolInput) => {
      toolResults.push({ tool, success, timestamp: new Date().toISOString() });
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
    onEmailDraft: (draft) => {
      lastDraftRef.current = draft;
    },
    onContractSent: (payload) => {
      contractSentSignal = payload;
    },
    onStop: (reason) => {
      stopObserved = true;
      console.log(`[SalesAgent] Stopped: ${reason}`);
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
      resume: sessionId || undefined,
      executable: "bun",
      pathToClaudeCodeExecutable: getClaudeCodePath(),
      env: queryEnv,
      systemPrompt: { type: "preset" as const, preset: "claude_code" as const, append: systemPrompt },
      settingSources: ["user", "project"] as any,
      allowedTools: ALLOWED_TOOLS,
      mcpServers,
      agents: SALES_SUBAGENTS,
      hooks,
      permissionMode: "bypassPermissions" as const,  // Fully autonomous - no permission prompts
      abortController: controller
    };

    let planSummary: any = null;
    let judgeSummary: any = null;
    let executionSummary: any = null;
    let toolUsage: any = null;

    for await (const message of query({
      prompt: buildStreamingPrompt(userPrompt, { sessionId }),
      options: queryOptions as any
    }) as any) {
      // Capture session ID
      if (message.type === "system" && message.subtype === "init") {
        resultSessionId = message.session_id || resultSessionId;
      }

      if (message.type === "summary") {
        const m = message as any;
        if (m.subtype === "plan") {
          planSummary = buildPlanSummary(m.summary);
        }
        if (m.subtype === "judge") judgeSummary = buildJudgeSummary(m.summary);
        if (m.subtype === "execution") executionSummary = buildExecutionSummary(m.summary);
        if (m.subtype === "tool_usage") toolUsage = m.summary;
      }

      if (message.type === "assistant" && message.content) {
      }

      if (message.type === "tool_use") {
      }

      if (message.type === "tool_result") {
      }

      // Check for result
      if (message.type === "result") {
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

        const derivedStateForAdvance = updatedSummary
          ? await deriveCommitmentState({
              dealId,
              dealSummary: updatedSummary,
              dealStageId: propertiesForStage.dealstage,
              dealStageName: STAGE_NAMES[String(propertiesForStage.dealstage || "")],
              artifacts: artifactsForStage,
              event: { subject: eventContext.subject, body: eventContext.body }
            })
          : derivedState;

        const requireDraftForAdvance = ["new_inbound", "reply_to_existing"].includes(event.source);
        const stageAdvance = await advanceCommitmentStage({
          dealId,
          currentStageId: String(propertiesForStage.dealstage || dealContext.dealStage || derivedStateForAdvance.commitmentCurrent),
          derivedState: derivedStateForAdvance,
          properties: propertiesForStage,
          artifacts: { ...artifactsForStage, invoiceLink },
          draftEvidence,
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
