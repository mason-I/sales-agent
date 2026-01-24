/**
 * Evaluator Agent
 *
 * Analyzes conversation results and produces structured evaluation scores.
 * Uses Claude SDK with structured outputs for consistent, parseable results.
 */

import { query } from "@anthropic-ai/claude-agent-sdk";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { getClaudeCodePath, getClaudeEnv, extractStructuredOutput } from "../runtime/claude";
import { buildStreamingPrompt } from "../runtime/promptStream";
import { fetchDealProperties, fetchDealEngagements } from "../lib/hubspot";
import {
  loadConversationResults,
  loadEvalRunConfig
} from "./runNoteEnhancer";
import type {
  ConversationResult,
  ConversationEvalScore,
  PerTurnEvalScore,
  AggregateEvalResult,
  EvaluationResult,
  ConversationOutcome,
  ErrorCategory
} from "./types";
import { CONVERSATION_EVAL_SCHEMA } from "./types";

// =============================================================================
// Evaluation System Prompt
// =============================================================================

const EVALUATOR_SYSTEM_PROMPT = `You are an expert evaluator analyzing sales agent conversations.

Your task is to evaluate how well a sales agent handled a conversation with a potential customer.

EVALUATION CRITERIA:

1. **Relevance (0-10)**: Did the agent's response directly address what the customer said?
   - 10: Perfectly addressed the customer's message
   - 5: Partially relevant but missed key points
   - 0: Completely off-topic or ignored the customer

2. **Progression Value (0-10)**: Did this move the deal forward?
   - 10: Gathered critical qualification info or moved to next stage
   - 5: Maintained engagement but no real progress
   - 0: Damaged the relationship or lost ground

3. **Guardrail Compliance**: Did the agent follow these rules?
   - Async-only communication (no calls/meetings proposed)
   - Pricing only when explicitly or implicitly requested, using catalog pricing (no discounts)
   - No promises without verification

4. **Memory Accuracy**: Did the agent remember information from earlier turns?
   - Reference to prior context shows memory
   - Repeating questions already answered shows failure

5. **Discovery Effectiveness (0-10)**: How well did the agent uncover customer information?
   - Asked open-ended questions
   - Built rapport before pushing for details
   - Captured and used revealed information

6. **Response Quality (0-10)**: Overall quality of agent responses
   - Professional tone
   - Clear and concise
   - Personalized to the customer
   - Value-focused

7. **CRM Accuracy**: Did the agent update HubSpot correctly?
   - Contact created with correct info
   - Deal stage progression appropriate
   - Properties populated with revealed info

VIOLATION CODES:
   - SYNC_CHANNEL: Proposed call/meeting instead of email
   - PREMATURE_PRICING: Discussed pricing without pricing intent or without catalog reference
- IGNORED_CUSTOMER: Failed to address customer's question
- REDUNDANT_QUESTION: Asked something already answered
- PUSHY_BEHAVIOR: Pushed too hard, damaging rapport
- WRONG_STAGE: Deal stage doesn't match conversation state
- MISSING_DATA: Failed to capture revealed information

Provide specific, actionable recommendations for improvement.`;

// =============================================================================
// CRM Verification
// =============================================================================

type CRMVerification = {
  contactExists: boolean;
  dealExists: boolean;
  dealStage: string | null;
  dealProperties: Record<string, any>;
  engagementCount: number;
  crmAccurate: boolean;
  crmIssues: string[];
};

async function verifyCRMState(
  result: ConversationResult
): Promise<CRMVerification> {
  const issues: string[] = [];
  let contactExists = false;
  let dealExists = false;
  let dealStage: string | null = null;
  let dealProperties: Record<string, any> = {};
  let engagementCount = 0;

  if (!result.entities.dealId) {
    issues.push("No deal created for conversation");
    return {
      contactExists: false,
      dealExists: false,
      dealStage: null,
      dealProperties: {},
      engagementCount: 0,
      crmAccurate: false,
      crmIssues: issues
    };
  }

  try {
    // Fetch deal properties
    const props = await fetchDealProperties(result.entities.dealId, [
      "dealname",
      "dealstage",
      "deal_summary",
      "sw_primary_pain",
      "amount",
      "timeline_for_change"
    ]);

    dealExists = true;
    dealStage = props.dealstage || null;
    dealProperties = props;

    // Check if deal properties match revealed info
    const persona = result.persona;

    if (persona.budget && !props.amount) {
      issues.push("Budget revealed but not captured in deal");
    }

    if (persona.timeline && !props.timeline_for_change) {
      issues.push("Timeline revealed but not captured in deal");
    }

    // Check engagement count
    const engagements = await fetchDealEngagements(result.entities.dealId);
    engagementCount = engagements.length;

    const expectedEngagements = result.turns.length;
    if (engagementCount < expectedEngagements) {
      issues.push(`Expected ${expectedEngagements} engagements, found ${engagementCount}`);
    }

    // Contact check (inferred from deal existing)
    if (result.entities.contactId) {
      contactExists = true;
    }
  } catch (error: any) {
    issues.push(`CRM verification failed: ${error.message}`);
  }

  return {
    contactExists,
    dealExists,
    dealStage,
    dealProperties,
    engagementCount,
    crmAccurate: issues.length === 0,
    crmIssues: issues
  };
}

// =============================================================================
// Single Conversation Evaluation
// =============================================================================

function buildEvaluationPrompt(
  result: ConversationResult,
  crmVerification: CRMVerification
): string {
  let prompt = "CONVERSATION TO EVALUATE:\n\n";

  prompt += `Customer Persona: ${result.persona.id}\n`;
  prompt += `Customer Intent: ${result.persona.intent}\n`;
  prompt += `Disclosure Style: ${result.persona.disclosureStyle}\n`;
  prompt += `Outcome: ${result.outcome}\n`;
  prompt += `End Reason: ${result.endReason}\n\n`;

  prompt += "TRANSCRIPT:\n";
  for (const turn of result.transcript) {
    const role = turn.role === "customer" ? "CUSTOMER" : "AGENT";
    prompt += `[Turn ${turn.turnNumber}] ${role}: ${turn.message}\n\n`;
  }

  prompt += "\nCRM STATE:\n";
  prompt += `Deal Created: ${crmVerification.dealExists}\n`;
  prompt += `Deal Stage: ${crmVerification.dealStage || "N/A"}\n`;
  prompt += `Engagements Logged: ${crmVerification.engagementCount}\n`;

  if (crmVerification.crmIssues.length > 0) {
    prompt += `CRM Issues: ${crmVerification.crmIssues.join("; ")}\n`;
  }

  prompt += "\nINFORMATION CUSTOMER COULD REVEAL:\n";
  prompt += `Budget: ${result.persona.budget || "Not available"}\n`;
  prompt += `Timeline: ${result.persona.timeline || "Not available"}\n`;
  prompt += `Team Size: ${result.persona.teamSize || "Not available"}\n`;

  prompt += "\nEvaluate this conversation and provide structured scores.";

  return prompt;
}

async function evaluateConversation(
  result: ConversationResult
): Promise<ConversationEvalScore> {
  // Verify CRM state
  const crmVerification = await verifyCRMState(result);

  // Build evaluation prompt
  const evaluationPrompt = buildEvaluationPrompt(result, crmVerification);

  let structured: ConversationEvalScore | null = null;

    for await (const message of query({
      prompt: buildStreamingPrompt(evaluationPrompt),
      options: {
        model: "opus", // Use Opus for quality evaluation
        executable: "bun",
        pathToClaudeCodeExecutable: getClaudeCodePath(),
        env: getClaudeEnv(),
        systemPrompt: { type: "preset", preset: "claude_code", append: EVALUATOR_SYSTEM_PROMPT },
        settingSources: ["user", "project"] as any,
        allowedTools: ["StructuredOutput"],
        outputFormat: { type: "json_schema", schema: CONVERSATION_EVAL_SCHEMA },
        permissionMode: "bypassPermissions" as const
      }
    }) as AsyncIterable<any>) {
    // Check for structured output in the result
    if (message.type === "result" && message.structured_output) {
      structured = message.structured_output as ConversationEvalScore;
    }

    // Also check for tool use
    const extracted = extractStructuredOutput(message);
    if (extracted) {
      structured = extracted as ConversationEvalScore;
    }
  }

  // Fallback if structured output fails
  if (!structured) {
    structured = {
      conversationId: result.conversationId,
      personaId: result.persona.id,
      perTurnScores: result.turns.map((_, i) => ({
        turnNumber: i + 1,
        relevance: 5,
        progressionValue: 5,
        guardrailCompliance: true,
        memoryAccuracy: true,
        issues: []
      })),
      conversationScore: 50,
      qualificationSuccess: result.outcome === "qualified",
      discoveryEffectiveness: 5,
      responseQuality: 5,
      crmAccuracy: crmVerification.crmAccurate,
      violationCodes: crmVerification.crmIssues.length > 0 ? ["CRM_ISSUES"] : [],
      recommendations: ["Evaluation fallback - structured output failed"]
    };
  }

  // Ensure CRM accuracy reflects our verification
  structured.crmAccuracy = crmVerification.crmAccurate;

  // Add CRM issues to violations if not already there
  for (const issue of crmVerification.crmIssues) {
    if (!structured.violationCodes.includes("MISSING_DATA")) {
      structured.violationCodes.push("MISSING_DATA");
      break;
    }
  }

  return structured;
}

// =============================================================================
// Aggregate Evaluation
// =============================================================================

function aggregateScores(
  runId: string,
  scores: ConversationEvalScore[],
  results: ConversationResult[],
  overallConversationCount: number,
  excludedErrorCategoryCounts: Record<ErrorCategory, number>
): AggregateEvalResult {

  // Outcome distribution
  const outcomeDistribution: Record<ConversationOutcome, number> = {
    qualified: 0,
    stalled: 0,
    lost: 0,
    timeout: 0
  };

  for (const result of results) {
    outcomeDistribution[result.outcome]++;
  }

  // Calculate averages
  let totalScore = 0;
  let totalDiscovery = 0;
  let totalQuality = 0;
  let passCount = 0;
  let failCount = 0;

  // Violation counts
  const violationCounts = new Map<string, number>();

  // Recommendation counts
  const recommendationCounts = new Map<string, number>();

  // Persona breakdown
  const personaMap = new Map<string, {
    count: number;
    totalScore: number;
    passCount: number;
  }>();

  for (const score of scores) {
    totalScore += score.conversationScore;
    totalDiscovery += score.discoveryEffectiveness;
    totalQuality += score.responseQuality;

    // Pass/fail based on score threshold
    if (score.conversationScore >= 60 && score.violationCodes.length === 0) {
      passCount++;
    } else {
      failCount++;
    }

    // Count violations
    for (const code of score.violationCodes) {
      violationCounts.set(code, (violationCounts.get(code) || 0) + 1);
    }

    // Count recommendations
    for (const rec of score.recommendations) {
      recommendationCounts.set(rec, (recommendationCounts.get(rec) || 0) + 1);
    }

    // Persona breakdown
    if (!personaMap.has(score.personaId)) {
      personaMap.set(score.personaId, { count: 0, totalScore: 0, passCount: 0 });
    }
    const persona = personaMap.get(score.personaId)!;
    persona.count++;
    persona.totalScore += score.conversationScore;
    if (score.conversationScore >= 60 && score.violationCodes.length === 0) {
      persona.passCount++;
    }
  }

  const count = scores.length;
  const divisor = count > 0 ? count : 1;
  const excludedConversationCount = Object.values(excludedErrorCategoryCounts).reduce((sum, val) => sum + val, 0);

  // Sort violations and recommendations by count
  const commonViolations = Array.from(violationCounts.entries())
    .map(([code, count]) => ({ code, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const commonRecommendations = Array.from(recommendationCounts.entries())
    .map(([recommendation, count]) => ({ recommendation, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const personaBreakdown = Array.from(personaMap.entries()).map(([personaId, data]) => ({
    personaId,
    count: data.count,
    averageScore: data.totalScore / data.count,
    passRate: data.passCount / data.count
  }));

  return {
    runId,
    evaluatedAt: new Date().toISOString(),
    totalConversations: count,
    overallConversationCount,
    excludedConversationCount,
    excludedErrorCategoryCounts,
    passCount,
    failCount,
    passRate: count > 0 ? passCount / count : 0,
    averageScore: totalScore / divisor,
    averageDiscoveryEffectiveness: totalDiscovery / divisor,
    averageResponseQuality: totalQuality / divisor,
    outcomeDistribution,
    commonViolations,
    commonRecommendations,
    personaBreakdown
  };
}

// =============================================================================
// Main Evaluation Entry Point
// =============================================================================

/**
 * Evaluate all conversations in an eval run
 */
export async function evaluateRun(
  runId: string,
  options?: { logProgress?: boolean }
): Promise<EvaluationResult | null> {
  const config = loadEvalRunConfig(runId);
  if (!config) {
    console.error(`No config found for run: ${runId}`);
    return null;
  }

  const results = loadConversationResults(runId);
  if (results.length === 0) {
    console.error(`No conversation results found for run: ${runId}`);
    return null;
  }

  const excludedResults = results.filter(r => r.errorCategory === "harness");
  const scoredResults = results.filter(r => r.errorCategory !== "harness");

  const excludedErrorCategoryCounts: Record<ErrorCategory, number> = {
    harness: 0,
    crm: 0,
    customer_llm: 0,
    agent_runtime: 0,
    unknown: 0
  };

  for (const result of excludedResults) {
    const category = result.errorCategory || "unknown";
    excludedErrorCategoryCounts[category] += 1;
  }

  if (options?.logProgress) {
    console.log(`Evaluating ${scoredResults.length} conversations for run: ${runId}`);
    if (excludedResults.length > 0) {
      console.log(`Excluded ${excludedResults.length} harness failures from scoring.`);
    }
  }

  const conversationScores: ConversationEvalScore[] = [];

  for (let i = 0; i < scoredResults.length; i++) {
    const result = scoredResults[i];

    if (options?.logProgress) {
      console.log(`[${i + 1}/${scoredResults.length}] Evaluating ${result.conversationId}...`);
    }

    try {
      const score = await evaluateConversation(result);
      conversationScores.push(score);
    } catch (error: any) {
      console.error(`Failed to evaluate ${result.conversationId}: ${error.message}`);

      // Add a fallback score
      conversationScores.push({
        conversationId: result.conversationId,
        personaId: result.persona.id,
        perTurnScores: [],
        conversationScore: 0,
        qualificationSuccess: false,
        discoveryEffectiveness: 0,
        responseQuality: 0,
        crmAccuracy: false,
        violationCodes: ["EVAL_ERROR"],
        recommendations: [`Evaluation failed: ${error.message}`]
      });
    }
  }

  // Generate aggregate
  const aggregate = aggregateScores(runId, conversationScores, scoredResults, results.length, excludedErrorCategoryCounts);

  const evaluation: EvaluationResult = {
    runId,
    evaluatedAt: new Date().toISOString(),
    conversationScores,
    aggregate
  };

  // Save evaluation result
  const evalPath = join(process.cwd(), "data", "eval-runs", runId, "evaluation.json");
  writeFileSync(evalPath, JSON.stringify(evaluation, null, 2));

  if (options?.logProgress) {
    console.log(`\nEvaluation complete!`);
    console.log(`Pass rate: ${(aggregate.passRate * 100).toFixed(1)}%`);
    console.log(`Average score: ${aggregate.averageScore.toFixed(1)}/100`);
    console.log(`Results saved to: ${evalPath}`);
  }

  return evaluation;
}

/**
 * Load evaluation result
 */
export function loadEvaluationResult(runId: string): EvaluationResult | null {
  const evalPath = join(process.cwd(), "data", "eval-runs", runId, "evaluation.json");
  if (!existsSync(evalPath)) return null;

  try {
    return JSON.parse(readFileSync(evalPath, "utf-8")) as EvaluationResult;
  } catch {
    return null;
  }
}
