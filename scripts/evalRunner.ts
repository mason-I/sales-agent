/**
 * Eval Runner CLI
 *
 * Main entry point for running automated sales agent evaluations.
 *
 * Usage:
 *   bun eval -- --count 100 --concurrency 10
 *   bun eval:score -- --run-id abc123
 *   bun eval:cleanup -- --run-id abc123 --dry-run
 */

import { randomUUID } from "crypto";
import { accessSync, constants, readFileSync } from "fs";
import { join } from "path";
import pLimit from "p-limit";
import { loadEnv } from "../src/lib/env";
import { runConversation } from "../src/eval/conversationRunner";
import { generatePersonaInstance, selectPersonaTemplate } from "../src/eval/customerSimulator";
import { evaluateRun } from "../src/eval/evaluator";
import { cleanupEvalRun } from "../src/eval/cleanup";
import { hubspotRequest } from "../src/lib/hubspot";
import { getClaudeCodePath } from "../src/runtime/claude";
import {
  saveEvalRunConfig,
  saveConversationResult,
  generateEvalRunSummary,
  saveEvalRunSummary
} from "../src/eval/runNoteEnhancer";
import type { CustomerPersona, EvalRunConfig, PersonaDistribution, ConversationResult } from "../src/eval/types";

// =============================================================================
// CLI Argument Parsing
// =============================================================================

function parseArgs(): {
  command: "run" | "score" | "cleanup";
  count: number;
  concurrency: number;
  personaSet: string;
  runId?: string;
  dryRun: boolean;
} {
  const args = process.argv.slice(2);
  let command: "run" | "score" | "cleanup" = "run";
  let count = 10;
  let concurrency = 5;
  let personaSet = "default";
  let runId: string | undefined;
  let dryRun = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "score" || arg === "evaluate") {
      command = "score";
    } else if (arg === "cleanup" || arg === "clean") {
      command = "cleanup";
    } else if (arg === "--count" || arg === "-c") {
      count = parseInt(args[++i], 10) || 10;
    } else if (arg === "--concurrency" || arg === "-p") {
      concurrency = parseInt(args[++i], 10) || 5;
    } else if (arg === "--personas") {
      personaSet = args[++i] || "default";
    } else if (arg === "--run-id" || arg === "-r") {
      runId = args[++i];
    } else if (arg === "--dry-run") {
      dryRun = true;
    }
  }

  return { command, count, concurrency, personaSet, runId, dryRun };
}

// =============================================================================
// Persona Generation
// =============================================================================

type PersonaConfig = {
  templates: any[];
  distribution: PersonaDistribution[];
};

function loadPersonaConfig(personaSet: string): PersonaConfig {
  const configPath = join(process.cwd(), "src", "eval", "personas", `${personaSet}.json`);
  const content = readFileSync(configPath, "utf-8");
  return JSON.parse(content) as PersonaConfig;
}

async function generatePersonas(
  config: PersonaConfig,
  count: number,
  runId: string
): Promise<CustomerPersona[]> {
  const personas: CustomerPersona[] = [];
  const forcedPersonaId = process.env.EVAL_PERSONA_ID || "";
  const forcedTemplate = forcedPersonaId
    ? config.templates.find((template) => template.id === forcedPersonaId)
    : null;

  if (forcedPersonaId && !forcedTemplate) {
    throw new Error(`EVAL_PERSONA_ID ${forcedPersonaId} not found in persona set.`);
  }

  for (let i = 0; i < count; i++) {
    // Select template based on weighted distribution
    const random = Math.random();
    const template = forcedTemplate || selectPersonaTemplate(config.templates, config.distribution, random);

    // Generate unique instance
    const persona = await generatePersonaInstance(template, runId, i);
    personas.push(persona);
  }

  return personas;
}

// =============================================================================
// Phase 1: Execute Conversations
// =============================================================================

async function runPreflight(): Promise<{ ok: true } | { ok: false; error: string }> {
  const claudePath = getClaudeCodePath();
  if (!claudePath) {
    return { ok: false, error: "Claude CLI not found. Set CLAUDE_CODE_PATH or ensure 'claude' is in PATH." };
  }

  try {
    accessSync(claudePath, constants.X_OK);
  } catch {
    return { ok: false, error: `Claude CLI is not executable: ${claudePath}` };
  }

  try {
    await hubspotRequest("GET", "/crm/v3/objects/contacts?limit=1");
  } catch (error: any) {
    return { ok: false, error: `HubSpot preflight failed: ${error.message || error}` };
  }

  return { ok: true };
}

function buildFailureResult(
  runId: string,
  index: number,
  persona: CustomerPersona,
  error: any
): ConversationResult {
  const conversationId = `${runId}-${String(index).padStart(3, "0")}`;
  const now = new Date().toISOString();
  const message = error?.message || String(error || "Unknown error");

  return {
    conversationId,
    runId,
    persona,
    turns: [],
    transcript: [],
    outcome: "stalled",
    endReason: `Error: ${message}`,
    startedAt: now,
    completedAt: now,
    totalDurationMs: 0,
    entities: {
      contactId: null,
      dealId: null,
      engagementIds: [],
      taskIds: [],
      noteIds: []
    },
    agentRunNotes: [],
    error: message,
    errorCategory: "harness"
  };
}

async function executeConversations(
  count: number,
  concurrency: number,
  personaSet: string
): Promise<string> {
  const runId = randomUUID().slice(0, 8);
  console.log(`\n=== Starting Eval Run: ${runId} ===\n`);
  console.log(`Conversations: ${count}`);
  console.log(`Concurrency: ${concurrency}`);
  console.log(`Persona Set: ${personaSet}`);
  console.log("");

  // Load persona config
  const personaConfig = loadPersonaConfig(personaSet);

  // Save run config early so failures are tracked
  const config: EvalRunConfig = {
    runId,
    count,
    concurrency,
    personaSet,
    distribution: personaConfig.distribution,
    startedAt: new Date().toISOString()
  };
  saveEvalRunConfig(config);

  const preflight = await runPreflight();
  if (!preflight.ok) {
    console.error(`Preflight failed: ${preflight.error}`);
    const summary = generateEvalRunSummary(runId, { preflightError: preflight.error });
    if (summary) {
      saveEvalRunSummary(summary);
    }
    return runId;
  }

  // Generate personas
  console.log("Generating personas...");
  const personas = await generatePersonas(personaConfig, count, runId);

  // Distribution summary
  const distribution = new Map<string, number>();
  for (const p of personas) {
    distribution.set(p.id, (distribution.get(p.id) || 0) + 1);
  }
  console.log("Persona distribution:");
  for (const [id, num] of distribution) {
    console.log(`  ${id}: ${num}`);
  }
  console.log("");

  // Create concurrency limiter
  const limit = pLimit(concurrency);

  // Execute conversations in parallel
  console.log("Starting conversations...\n");
  const startTime = Date.now();

  const tasks = personas.map((persona, index) =>
    limit(async () => {
      try {
        const result = await runConversation(persona, {
          runId,
          conversationIndex: index,
          logProgress: true
        });

        // Save result immediately
        saveConversationResult(result);

        return result;
      } catch (error: any) {
        console.error(`[Conv ${index}] Failed: ${error.message || error}`);
        const failure = buildFailureResult(runId, index, persona, error);
        saveConversationResult(failure);
        return failure;
      }
    })
  );

  const results = await Promise.all(tasks);
  const successCount = results.filter(r => !r.error).length;
  const duration = Date.now() - startTime;

  console.log(`\n=== Execution Complete ===`);
  console.log(`Successful: ${successCount}/${count}`);
  console.log(`Duration: ${(duration / 1000).toFixed(1)}s`);
  console.log(`Run ID: ${runId}`);

  // Generate and save summary
  const summary = generateEvalRunSummary(runId);
  if (summary) {
    saveEvalRunSummary(summary);
    console.log(`\nOutcome Distribution:`);
    for (const [outcome, num] of Object.entries(summary.outcomeDistribution)) {
      if (num > 0) {
        console.log(`  ${outcome}: ${num}`);
      }
    }

    if (summary.errorCategoryCounts) {
      const nonZeroErrors = Object.entries(summary.errorCategoryCounts).filter(([, num]) => num > 0);
      if (nonZeroErrors.length > 0) {
        console.log(`\nError Categories:`);
        for (const [category, num] of nonZeroErrors) {
          console.log(`  ${category}: ${num}`);
        }
      }
    }
  }

  console.log(`\nNext steps:`);
  console.log(`  Evaluate: bun eval:score -- --run-id ${runId}`);
  console.log(`  Cleanup:  bun eval:cleanup -- --run-id ${runId}`);

  return runId;
}

// =============================================================================
// Phase 2: Score Conversations
// =============================================================================

async function scoreRun(runId: string): Promise<void> {
  console.log(`\n=== Evaluating Run: ${runId} ===\n`);

  const result = await evaluateRun(runId, { logProgress: true });

  if (!result) {
    console.error("Evaluation failed.");
    process.exit(1);
  }

  console.log(`\n=== Evaluation Summary ===`);
  console.log(`Total Conversations (scored): ${result.aggregate.totalConversations}`);
  console.log(`Overall Conversations: ${result.aggregate.overallConversationCount}`);
  if (result.aggregate.excludedConversationCount > 0) {
    console.log(`Excluded (harness): ${result.aggregate.excludedConversationCount}`);
  }
  console.log(`Pass Rate: ${(result.aggregate.passRate * 100).toFixed(1)}%`);
  console.log(`Average Score: ${result.aggregate.averageScore.toFixed(1)}/100`);
  console.log(`Discovery Effectiveness: ${result.aggregate.averageDiscoveryEffectiveness.toFixed(1)}/10`);
  console.log(`Response Quality: ${result.aggregate.averageResponseQuality.toFixed(1)}/10`);

  if (result.aggregate.commonViolations.length > 0) {
    console.log(`\nCommon Violations:`);
    for (const v of result.aggregate.commonViolations.slice(0, 5)) {
      console.log(`  ${v.code}: ${v.count}`);
    }
  }

  if (result.aggregate.personaBreakdown.length > 0) {
    console.log(`\nPerformance by Persona:`);
    for (const p of result.aggregate.personaBreakdown) {
      console.log(`  ${p.personaId}: ${p.averageScore.toFixed(1)}/100 (${(p.passRate * 100).toFixed(0)}% pass)`);
    }
  }

  if (result.aggregate.excludedConversationCount > 0) {
    const excluded = Object.entries(result.aggregate.excludedErrorCategoryCounts)
      .filter(([, count]) => count > 0)
      .map(([category, count]) => `${category}: ${count}`)
      .join(", ");
    if (excluded) {
      console.log(`\nExcluded Error Categories: ${excluded}`);
    }
  }

  console.log(`\nNext step:`);
  console.log(`  Cleanup: bun eval:cleanup -- --run-id ${runId}`);
}

// =============================================================================
// Phase 3: Cleanup
// =============================================================================

async function cleanup(runId: string, dryRun: boolean): Promise<void> {
  console.log(`\n=== Cleanup Run: ${runId} ===`);
  console.log(`Mode: ${dryRun ? "DRY RUN" : "LIVE"}\n`);

  const result = await cleanupEvalRun(runId, {
    dryRun,
    logProgress: true,
    batchSize: 10,
    delayMs: 100
  });

  if (!dryRun) {
    console.log(`\nCleanup complete for run: ${runId}`);
  }
}

// =============================================================================
// Main
// =============================================================================

async function main() {
  loadEnv();
  // Skip LLM-based run note insights during eval to avoid 90s+ overhead per turn
  process.env.SKIP_RUN_NOTE_LLM = "true";

  const args = parseArgs();

  switch (args.command) {
    case "run":
      await executeConversations(args.count, args.concurrency, args.personaSet);
      break;

    case "score":
      if (!args.runId) {
        console.error("Error: --run-id is required for scoring");
        console.error("Usage: bun eval:score -- --run-id <run-id>");
        process.exit(1);
      }
      await scoreRun(args.runId);
      break;

    case "cleanup":
      if (!args.runId) {
        console.error("Error: --run-id is required for cleanup");
        console.error("Usage: bun eval:cleanup -- --run-id <run-id> [--dry-run]");
        process.exit(1);
      }
      await cleanup(args.runId, args.dryRun);
      break;
  }
}

main().catch(error => {
  console.error("Fatal error:", error.message || error);
  process.exit(1);
});
