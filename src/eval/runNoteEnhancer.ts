/**
 * Run Note Enhancer
 *
 * Extends the existing run notes system with per-turn structured data
 * for the evaluation system.
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "fs";
import { join } from "path";
import type { RunNote } from "../runtime/runNotes";
import type {
  ConversationResult,
  CustomerPersona,
  TurnNote,
  ConversationOutcome,
  TrackedEntities,
  EvalRunConfig,
  ErrorCategory
} from "./types";

// =============================================================================
// Enhanced Run Note Types
// =============================================================================

export type EnhancedRunNote = RunNote & {
  conversationId: string;
  persona: CustomerPersona;
  turns: TurnNote[];
  conversationOutcome: ConversationOutcome;
};

// =============================================================================
// File System Helpers
// =============================================================================

function ensureEvalRunDir(runId: string): string {
  const baseDir = join(process.cwd(), "data", "eval-runs", runId);
  const conversationsDir = join(baseDir, "conversations");

  if (!existsSync(baseDir)) {
    mkdirSync(baseDir, { recursive: true });
  }
  if (!existsSync(conversationsDir)) {
    mkdirSync(conversationsDir, { recursive: true });
  }

  return baseDir;
}

// =============================================================================
// Config Management
// =============================================================================

/**
 * Save eval run configuration
 */
export function saveEvalRunConfig(config: EvalRunConfig): void {
  const runDir = ensureEvalRunDir(config.runId);
  const configPath = join(runDir, "config.json");
  writeFileSync(configPath, JSON.stringify(config, null, 2));
}

/**
 * Load eval run configuration
 */
export function loadEvalRunConfig(runId: string): EvalRunConfig | null {
  const configPath = join(process.cwd(), "data", "eval-runs", runId, "config.json");
  if (!existsSync(configPath)) return null;

  try {
    return JSON.parse(readFileSync(configPath, "utf-8")) as EvalRunConfig;
  } catch {
    return null;
  }
}

// =============================================================================
// Conversation Result Storage
// =============================================================================

/**
 * Save a conversation result to the eval run directory
 */
export function saveConversationResult(result: ConversationResult): void {
  const runDir = ensureEvalRunDir(result.runId);
  const conversationsDir = join(runDir, "conversations");

  // Extract conversation index from conversationId (format: runId-001)
  const parts = result.conversationId.split("-");
  const index = parts[parts.length - 1];
  const filename = `${index}.jsonl`;

  const filePath = join(conversationsDir, filename);
  appendFileSync(filePath, JSON.stringify(result) + "\n");
}

/**
 * Load all conversation results for an eval run
 */
export function loadConversationResults(runId: string): ConversationResult[] {
  const conversationsDir = join(process.cwd(), "data", "eval-runs", runId, "conversations");
  if (!existsSync(conversationsDir)) return [];

  const results: ConversationResult[] = [];
  const files = readdirSync(conversationsDir).filter((f: string) => f.endsWith(".jsonl"));

  for (const file of files) {
    const filePath = join(conversationsDir, file);
    const content = readFileSync(filePath, "utf-8").trim();
    if (!content) continue;

    // Each file may have multiple lines (though typically just one)
    for (const line of content.split("\n")) {
      if (line.trim()) {
        try {
          results.push(JSON.parse(line) as ConversationResult);
        } catch {
          // Skip malformed lines
        }
      }
    }
  }

  return results;
}

/**
 * Load tracked entities from all conversation results
 */
export function loadTrackedEntities(runId: string): TrackedEntities[] {
  const results = loadConversationResults(runId);
  return results.map(r => r.entities);
}

// =============================================================================
// Summary Generation
// =============================================================================

export type EvalRunSummary = {
  runId: string;
  config: EvalRunConfig;
  expectedConversations: number;
  completedAt: string;
  totalConversations: number;
  successfulConversations: number;
  failedConversations: number;
  outcomeDistribution: Record<ConversationOutcome, number>;
  errorCategoryCounts: Record<ErrorCategory, number>;
  preflightError?: string;
  averageTurns: number;
  averageDurationMs: number;
  personaBreakdown: Array<{
    personaId: string;
    count: number;
    outcomes: Record<string, number>;
  }>;
  totalEntities: {
    contacts: number;
    deals: number;
    engagements: number;
    tasks: number;
    notes: number;
  };
};

/**
 * Generate summary for an eval run
 */
export function generateEvalRunSummary(
  runId: string,
  options?: { preflightError?: string }
): EvalRunSummary | null {
  const config = loadEvalRunConfig(runId);
  if (!config) return null;

  const results = loadConversationResults(runId);
  if (results.length === 0 && !options?.preflightError) return null;

  // Calculate outcome distribution
  const outcomeDistribution: Record<ConversationOutcome, number> = {
    qualified: 0,
    stalled: 0,
    lost: 0,
    timeout: 0
  };

  const errorCategoryCounts: Record<ErrorCategory, number> = {
    harness: 0,
    crm: 0,
    customer_llm: 0,
    agent_runtime: 0,
    unknown: 0
  };

  // Persona breakdown
  const personaMap = new Map<string, { count: number; outcomes: Record<string, number> }>();

  // Entity counts
  const entityCounts = {
    contacts: new Set<string>(),
    deals: new Set<string>(),
    engagements: new Set<string>(),
    tasks: new Set<string>(),
    notes: new Set<string>()
  };

  let totalTurns = 0;
  let totalDuration = 0;
  let successCount = 0;
  let failCount = 0;

  for (const result of results) {
    // Outcomes
    outcomeDistribution[result.outcome]++;

    // Success/fail (qualified is success, lost is fail)
    if (result.outcome === "qualified") {
      successCount++;
    } else if (result.outcome === "lost" || result.error) {
      failCount++;
    }

    // Turns and duration
    totalTurns += result.turns.length;
    totalDuration += result.totalDurationMs;

    // Persona breakdown
    const personaId = result.persona.id;
    if (!personaMap.has(personaId)) {
      personaMap.set(personaId, { count: 0, outcomes: {} });
    }
    const persona = personaMap.get(personaId)!;
    persona.count++;
    persona.outcomes[result.outcome] = (persona.outcomes[result.outcome] || 0) + 1;

    // Entities
    if (result.entities.contactId) entityCounts.contacts.add(result.entities.contactId);
    if (result.entities.dealId) entityCounts.deals.add(result.entities.dealId);
    for (const id of result.entities.engagementIds) entityCounts.engagements.add(id);
    for (const id of result.entities.taskIds) entityCounts.tasks.add(id);
    for (const id of result.entities.noteIds) entityCounts.notes.add(id);

    if (result.errorCategory) {
      errorCategoryCounts[result.errorCategory]++;
    } else if (result.error) {
      errorCategoryCounts.unknown++;
    }
  }

  const personaBreakdown = Array.from(personaMap.entries()).map(([personaId, data]) => ({
    personaId,
    count: data.count,
    outcomes: data.outcomes
  }));

  const totalConversations = results.length;
  const divisor = totalConversations > 0 ? totalConversations : 1;

  return {
    runId,
    config,
    expectedConversations: config.count,
    completedAt: new Date().toISOString(),
    totalConversations,
    successfulConversations: successCount,
    failedConversations: failCount,
    outcomeDistribution,
    errorCategoryCounts,
    preflightError: options?.preflightError,
    averageTurns: totalTurns / divisor,
    averageDurationMs: totalDuration / divisor,
    personaBreakdown,
    totalEntities: {
      contacts: entityCounts.contacts.size,
      deals: entityCounts.deals.size,
      engagements: entityCounts.engagements.size,
      tasks: entityCounts.tasks.size,
      notes: entityCounts.notes.size
    }
  };
}

/**
 * Save eval run summary
 */
export function saveEvalRunSummary(summary: EvalRunSummary): void {
  const runDir = ensureEvalRunDir(summary.runId);
  const summaryPath = join(runDir, "summary.json");
  writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
}

/**
 * Load eval run summary
 */
export function loadEvalRunSummary(runId: string): EvalRunSummary | null {
  const summaryPath = join(process.cwd(), "data", "eval-runs", runId, "summary.json");
  if (!existsSync(summaryPath)) return null;

  try {
    return JSON.parse(readFileSync(summaryPath, "utf-8")) as EvalRunSummary;
  } catch {
    return null;
  }
}
