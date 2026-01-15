/**
 * Conversation Runner
 *
 * Orchestrates a single multi-turn conversation between
 * the customer simulator and the sales agent.
 */

import { runSalesAgent } from "../runtime/salesAgent";
import { generateInitialInquiry, generateCustomerResponse } from "./customerSimulator";
import type {
  CustomerPersona,
  Turn,
  TurnNote,
  ConversationResult,
  ConversationOutcome,
  TrackedEntities,
  ErrorCategory
} from "./types";
import { STAGE_ORDER, STAGE_NAMES } from "../config/dealStage";
import { deriveCommitmentState, fetchCommitmentArtifacts } from "../runtime/commitment";

type ConversationConfig = {
  runId: string;
  conversationIndex: number;
  logProgress?: boolean;
};

/**
 * Extract the agent's email response from the run result.
 * The agent logs email drafts via the crm_logEmailDraft MCP tool.
 * We need to capture what the agent would have sent.
 */
async function extractAgentResponse(
  dealId: string
): Promise<string | null> {
  // The agent logs drafts to HubSpot. For now, we'll rely on
  // the agent's behavior - the draft is logged as an engagement.
  // In a full implementation, we'd query the latest engagement.
  //
  // For the eval system, we can capture this from hooks or
  // by querying HubSpot engagements after each turn.
  //
  // Simplified: return a placeholder that will be enhanced
  // when we integrate with the full system.
  return null;
}

function classifyErrorCategory(errorMessage: string | undefined): ErrorCategory | undefined {
  if (!errorMessage) return undefined;
  const lower = errorMessage.toLowerCase();

  if (lower.includes("hubspot") || lower.includes("crm") || lower.includes("invalid email")) {
    return "crm";
  }
  if (lower.includes("structured output") || lower.includes("structured_output") || lower.includes("customer llm")) {
    return "customer_llm";
  }
  if (lower.includes("claude") || lower.includes("process exited") || lower.includes("sdk") || lower.includes("max turns")) {
    return "agent_runtime";
  }

  return "unknown";
}

async function checkGoalReached(dealId: string): Promise<{ reached: boolean; reason?: string; isLost?: boolean }> {
  const { fetchDealProperties } = await import("../lib/hubspot");

  try {
    const props = await fetchDealProperties(dealId, ["dealstage", "deal_summary"]);
    const stage = String(props.dealstage || "");

    if (stage === "closedlost") {
      return { reached: true, reason: "Deal marked closed lost", isLost: true };
    }

    const artifacts = await fetchCommitmentArtifacts(dealId);
    let derivedCommitment = stage;
    try {
      const derived = await deriveCommitmentState({
        dealId,
        dealSummary: props.deal_summary,
        dealStageId: stage,
        dealStageName: STAGE_NAMES[stage],
        artifacts
      });
      derivedCommitment = derived.commitmentCurrent || stage;
    } catch {
      // fall back to current stage
    }

    const commitmentIndex = STAGE_ORDER.indexOf(derivedCommitment);
    const quoteIndex = STAGE_ORDER.indexOf("contractsent");
    if (quoteIndex !== -1 && commitmentIndex >= quoteIndex) {
      return { reached: true, reason: `Commitment stage reached: ${derivedCommitment}` };
    }
  } catch {
    // ignore goal check errors
  }

  return { reached: false };
}

/**
 * Run a complete multi-turn conversation
 */
export async function runConversation(
  persona: CustomerPersona,
  config: ConversationConfig
): Promise<ConversationResult> {
  const conversationId = `${config.runId}-${String(config.conversationIndex).padStart(3, "0")}`;
  const startedAt = new Date().toISOString();

  const transcript: Turn[] = [];
  const turns: TurnNote[] = [];
  const entities: TrackedEntities = {
    contactId: null,
    dealId: null,
    engagementIds: [],
    taskIds: [],
    noteIds: []
  };

  let outcome: ConversationOutcome = "stalled";
  let endReason = "goal not reached";
  let lastError: string | undefined;
  let currentDealId: string | null = null;
  let turnNumber = 0;
  let goalReached = false;

  if (config.logProgress) {
    console.log(`[Conv ${conversationId}] Starting with persona: ${persona.id} (${persona.name})`);
  }

  try {
    // Turn 1: Customer sends initial inquiry
    turnNumber = 1;
    const turnStarted = new Date();

    const initialInquiry = await generateInitialInquiry(persona);

    transcript.push({
      turnNumber,
      role: "customer",
      message: initialInquiry.message,
      timestamp: turnStarted.toISOString()
    });

    if (config.logProgress) {
      console.log(`[Conv ${conversationId}] Turn ${turnNumber} - Customer: "${initialInquiry.message.slice(0, 50)}..."`);
    }

    // Agent processes Turn 1 (new_inbound)
    const agentTurnStart = new Date();
    const agentResult = await runSalesAgent({
      source: "new_inbound",
      type: "email",
      fromEmail: persona.email,
      fromName: persona.name,
      subject: "Quick question",
      body: initialInquiry.message
    });

    const turnCompleted = new Date();

    // Track entities
    entities.dealId = agentResult.dealId;
    entities.contactId = agentResult.contactId;
    currentDealId = agentResult.dealId;

    // Capture the agent's response directly from hooks (no polling)
    const agentResponseText = agentResult.lastDraft?.body || "";
    let lastAgentResponse = agentResponseText || "";
    if (agentResult.lastDraft?.emailId) {
      entities.engagementIds.push(agentResult.lastDraft.emailId);
    }

    transcript.push({
      turnNumber,
      role: "agent",
      message: agentResponseText || "[Agent response logged to HubSpot]",
      timestamp: turnCompleted.toISOString()
    });

    turns.push({
      turnNumber,
      customerMessage: initialInquiry.message,
      agentResponse: agentResponseText || "",
      turnStartedAt: turnStarted.toISOString(),
      turnCompletedAt: turnCompleted.toISOString(),
      turnLatencyMs: turnCompleted.getTime() - agentTurnStart.getTime(),
      toolsUsed: [], // Would be populated from hooks
      fieldsUpdated: [],
      skillsInvoked: [],
      agentSessionId: agentResult.sessionId
    });

    if (agentResult.error) {
      lastError = agentResult.error;
      outcome = "stalled";
      endReason = `Agent error: ${agentResult.error}`;
    }

    if (!agentResult.error && currentDealId) {
      const goalStatus = await checkGoalReached(currentDealId);
      if (goalStatus.reached) {
        goalReached = true;
        outcome = goalStatus.isLost ? "lost" : "qualified";
        endReason = goalStatus.reason || "Goal reached";
      }
    }

    if (!agentResult.error && !goalReached) {
      // Continue conversation until goal reached
      for (turnNumber = 2; ; turnNumber++) {
        const loopTurnStart = new Date();

        // Customer responds to agent
        const customerResponse = await generateCustomerResponse(
          persona,
          transcript,
          lastAgentResponse || ""
        );

        transcript.push({
          turnNumber,
          role: "customer",
          message: customerResponse.message,
          timestamp: new Date().toISOString()
        });

        if (config.logProgress) {
          console.log(`[Conv ${conversationId}] Turn ${turnNumber} - Customer: "${customerResponse.message.slice(0, 50)}..."`);
        }

        if (customerResponse.shouldEnd) {
          outcome = determineOutcome(customerResponse.endReason);
          endReason = customerResponse.endReason || "Customer ended conversation";
          break;
        }

        // Agent processes reply
        const replyAgentStart = new Date();
        const replyResult = await runSalesAgent({
          source: "reply_to_existing",
          type: "email",
          dealId: currentDealId!,
          fromEmail: persona.email,
          fromName: persona.name,
          subject: "Re: Quick question",
          body: customerResponse.message
        });

        const replyTurnCompleted = new Date();

        // Track engagement IDs (would be captured from hooks in full implementation)
        // entities.engagementIds.push(...);

        const replyAgentResponse = replyResult.lastDraft?.body || "";
        if (replyResult.lastDraft?.emailId) {
          entities.engagementIds.push(replyResult.lastDraft.emailId);
        }
        lastAgentResponse = replyAgentResponse || "";

        transcript.push({
          turnNumber,
          role: "agent",
          message: replyAgentResponse || "[Agent response logged to HubSpot]",
          timestamp: replyTurnCompleted.toISOString()
        });

        turns.push({
          turnNumber,
          customerMessage: customerResponse.message,
          agentResponse: replyAgentResponse || "",
          turnStartedAt: loopTurnStart.toISOString(),
          turnCompletedAt: replyTurnCompleted.toISOString(),
          turnLatencyMs: replyTurnCompleted.getTime() - replyAgentStart.getTime(),
          toolsUsed: [],
          fieldsUpdated: [],
          skillsInvoked: [],
          agentSessionId: replyResult.sessionId
        });

        if (replyResult.error) {
          lastError = replyResult.error;
          outcome = "stalled";
          endReason = `Agent error: ${replyResult.error}`;
          break;
        }

        if (currentDealId) {
          const goalStatus = await checkGoalReached(currentDealId);
          if (goalStatus.reached) {
            goalReached = true;
            outcome = goalStatus.isLost ? "lost" : "qualified";
            endReason = goalStatus.reason || "Goal reached";
            break;
          }
        }
      }
    }
  } catch (error: any) {
    lastError = error.message || "Unknown error";
    outcome = "stalled";
    endReason = `Error: ${lastError}`;

    if (config.logProgress) {
      console.error(`[Conv ${conversationId}] Error: ${lastError}`);
    }
  }

  const completedAt = new Date().toISOString();

  if (config.logProgress) {
    console.log(`[Conv ${conversationId}] Completed - Outcome: ${outcome}, Turns: ${turns.length}`);
  }

  const errorCategory = classifyErrorCategory(lastError);

  return {
    conversationId,
    runId: config.runId,
    persona,
    turns,
    transcript,
    outcome,
    endReason,
    startedAt,
    completedAt,
    totalDurationMs: new Date(completedAt).getTime() - new Date(startedAt).getTime(),
    entities,
    agentRunNotes: [], // Would be collected from run notes
    error: lastError,
    errorCategory
  };
}

/**
 * Determine conversation outcome from customer's end reason
 */
function determineOutcome(endReason: string | undefined): ConversationOutcome {
  if (!endReason) return "stalled";

  const reason = endReason.toLowerCase();

  if (reason.includes("qualified") || reason.includes("interested") || reason.includes("next step")) {
    return "qualified";
  }
  if (reason.includes("not interested") || reason.includes("bad experience") || reason.includes("frustrated")) {
    return "lost";
  }
  // Note: "escalated" outcome removed - agent is fully autonomous
  if (reason.includes("closed") && reason.includes("lost")) {
    return "lost";
  }

  return "stalled";
}

/**
 * Get the latest agent response from HubSpot engagements
 *
 * In a full implementation, this would query HubSpot for the
 * latest email engagement on the deal.
 */
async function getAgentResponseFromHubSpot(
  dealId: string,
  options?: { after?: string; timeoutMs?: number; pollIntervalMs?: number; logProgress?: boolean; logPrefix?: string }
): Promise<{ body: string | null; engagementId?: string | null }> {
  // Import dynamically to avoid circular dependencies
  const { fetchDealEngagements } = await import("../lib/hubspot");

  try {
    const timeoutMs = options?.timeoutMs ?? 10_000;
    const pollIntervalMs = options?.pollIntervalMs ?? 1_000;
    const afterTime = options?.after ? new Date(options.after).getTime() : null;
    const logPrefix = options?.logPrefix ?? "[ConversationRunner]";
    const logProgress = options?.logProgress ?? false;
    const deadline = Date.now() + timeoutMs;

    let attempt = 0;

    while (Date.now() <= deadline) {
      attempt += 1;
      const engagements = await fetchDealEngagements(dealId);

      if (logProgress && attempt === 1) {
        console.log(`${logPrefix} Fetched ${engagements.length} engagements for deal ${dealId}`);
      }

      const outboundEmails = engagements.filter((e: any) => {
        if (e.type !== "email") return false;
        if (e.direction !== "EMAIL" && e.direction !== "OUTGOING_EMAIL") return false;
        if (!afterTime) return true;
        const ts = e.timestamp ? new Date(e.timestamp).getTime() : 0;
        return ts > afterTime;
      });

      if (outboundEmails.length > 0) {
        const latest = outboundEmails[0];
        const body = typeof latest === "object" && latest !== null ? (latest as any).body || null : null;
        if (logProgress) {
          console.log(`${logPrefix} Extracted agent response (${body?.length || 0} chars) from engagement ${latest.id}`);
        }
        return { body, engagementId: latest.id };
      }

      if (Date.now() >= deadline) break;
      await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
    }

    if (logProgress) {
      console.log(`${logPrefix} No outbound email found within ${timeoutMs}ms for deal ${dealId}`);
    }

    return { body: null };
  } catch (error) {
    console.error(`[ConversationRunner] Failed to fetch agent response for deal ${dealId}:`, error);
    return { body: null };
  }
}

/**
 * Run multiple conversations in sequence (for testing)
 */
export async function runConversationBatch(
  personas: CustomerPersona[],
  runId: string,
  logProgress = false
): Promise<ConversationResult[]> {
  const results: ConversationResult[] = [];

  for (let i = 0; i < personas.length; i++) {
    const result = await runConversation(personas[i], {
      runId,
      conversationIndex: i,
      logProgress
    });
    results.push(result);
  }

  return results;
}
