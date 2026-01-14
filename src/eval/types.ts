/**
 * Evaluation System Types
 *
 * Core types for the automated sales agent evaluation system.
 */

import type { RunNote } from "../runtime/runNotes";

// =============================================================================
// Persona Types
// =============================================================================

export type DisclosureStyle =
  | "minimal"
  | "gradual"
  | "forthcoming"
  | "evasive"
  | "conditional"
  | "decreasing";

export type CustomerPersona = {
  id: string;
  name: string;
  company: string;
  role: string;
  email: string;
  intent: string;
  disclosureStyle: DisclosureStyle;
  budget: string | null;
  timeline: string | null;
  teamSize: string | null;
  behaviors: string[];
};

export type PersonaTemplate = Omit<CustomerPersona, "name" | "company" | "email">;

export type PersonaDistribution = {
  templateId: string;
  weight: number;
};

// =============================================================================
// Conversation Types
// =============================================================================

export type Turn = {
  turnNumber: number;
  role: "customer" | "agent";
  message: string;
  timestamp: string;
};

export type TurnNote = {
  turnNumber: number;
  customerMessage: string;
  agentResponse: string;
  turnStartedAt: string;
  turnCompletedAt: string;
  turnLatencyMs: number;
  toolsUsed: string[];
  fieldsUpdated: string[];
  skillsInvoked: string[];
  agentSessionId: string | null;
  turnScore?: TurnScore;
};

export type TurnScore = {
  relevance: number; // 0-10: How relevant was the response to the customer's message?
  progressionValue: number; // 0-10: Did this move the deal forward?
  guardrailCompliance: boolean; // Did agent follow async-only, no-calls rules?
  issues: string[];
};

export type ConversationOutcome =
  | "qualified" // Successfully moved to next stage
  | "stalled" // No progression, but not lost
  | "lost" // Customer disengaged, deal closed lost, or bad experience
  | "timeout"; // Hit time limit without conclusion

export type ErrorCategory =
  | "harness"
  | "crm"
  | "customer_llm"
  | "agent_runtime"
  | "unknown";

export type TrackedEntities = {
  contactId: string | null;
  dealId: string | null;
  engagementIds: string[];
  taskIds: string[];
  noteIds: string[];
};

export type ConversationResult = {
  conversationId: string;
  runId: string;
  persona: CustomerPersona;
  turns: TurnNote[];
  transcript: Turn[];
  outcome: ConversationOutcome;
  endReason: string;
  startedAt: string;
  completedAt: string;
  totalDurationMs: number;
  entities: TrackedEntities;
  agentRunNotes: RunNote[];
  error?: string;
  errorCategory?: ErrorCategory;
};

// =============================================================================
// Evaluation Types
// =============================================================================

export type PerTurnEvalScore = {
  turnNumber: number;
  relevance: number; // 0-10
  progressionValue: number; // 0-10
  guardrailCompliance: boolean;
  memoryAccuracy: boolean; // Did agent remember info from earlier turns?
  issues: string[];
};

export type ConversationEvalScore = {
  conversationId: string;
  personaId: string;
  perTurnScores: PerTurnEvalScore[];
  conversationScore: number; // 0-100 overall
  qualificationSuccess: boolean;
  discoveryEffectiveness: number; // 0-10: How well did agent uncover info?
  responseQuality: number; // 0-10: Quality of agent responses
  crmAccuracy: boolean; // Did CRM state match revealed info?
  violationCodes: string[];
  recommendations: string[];
};

export type AggregateEvalResult = {
  runId: string;
  evaluatedAt: string;
  totalConversations: number;
  overallConversationCount: number;
  excludedConversationCount: number;
  excludedErrorCategoryCounts: Record<ErrorCategory, number>;
  passCount: number;
  failCount: number;
  passRate: number;
  averageScore: number;
  averageDiscoveryEffectiveness: number;
  averageResponseQuality: number;
  outcomeDistribution: Record<ConversationOutcome, number>;
  commonViolations: Array<{ code: string; count: number }>;
  commonRecommendations: Array<{ recommendation: string; count: number }>;
  personaBreakdown: Array<{
    personaId: string;
    count: number;
    averageScore: number;
    passRate: number;
  }>;
};

export type EvaluationResult = {
  runId: string;
  evaluatedAt: string;
  conversationScores: ConversationEvalScore[];
  aggregate: AggregateEvalResult;
};

// =============================================================================
// Configuration Types
// =============================================================================

export type EvalRunConfig = {
  runId: string;
  count: number;
  concurrency: number;
  personaSet: string;
  distribution: PersonaDistribution[];
  startedAt: string;
};

export type CustomerSimulatorConfig = {
  model: "haiku" | "sonnet" | "opus";
  maxTokens: number;
};

// =============================================================================
// JSON Schema for Structured Outputs
// =============================================================================

export const TURN_EVAL_SCHEMA = {
  type: "object",
  properties: {
    turnNumber: { type: "number" },
    relevance: { type: "number", minimum: 0, maximum: 10 },
    progressionValue: { type: "number", minimum: 0, maximum: 10 },
    guardrailCompliance: { type: "boolean" },
    memoryAccuracy: { type: "boolean" },
    issues: { type: "array", items: { type: "string" } }
  },
  required: ["turnNumber", "relevance", "progressionValue", "guardrailCompliance", "memoryAccuracy", "issues"],
  additionalProperties: false
} as const;

export const CONVERSATION_EVAL_SCHEMA = {
  type: "object",
  properties: {
    conversationId: { type: "string" },
    personaId: { type: "string" },
    perTurnScores: {
      type: "array",
      items: TURN_EVAL_SCHEMA
    },
    conversationScore: { type: "number", minimum: 0, maximum: 100 },
    qualificationSuccess: { type: "boolean" },
    discoveryEffectiveness: { type: "number", minimum: 0, maximum: 10 },
    responseQuality: { type: "number", minimum: 0, maximum: 10 },
    crmAccuracy: { type: "boolean" },
    violationCodes: { type: "array", items: { type: "string" } },
    recommendations: { type: "array", items: { type: "string" } }
  },
  required: [
    "conversationId",
    "personaId",
    "perTurnScores",
    "conversationScore",
    "qualificationSuccess",
    "discoveryEffectiveness",
    "responseQuality",
    "crmAccuracy",
    "violationCodes",
    "recommendations"
  ],
  additionalProperties: false
} as const;

export const CUSTOMER_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    message: { type: "string" },
    shouldEnd: { type: "boolean" },
    endReason: { type: "string" }
  },
  required: ["message", "shouldEnd"],
  additionalProperties: false
} as const;
