import { fileURLToPath } from "url";
import { resolve } from "path";
import { loadEnv } from "../lib/env";
import {
  hubspotRequest,
  updateDealProperties,
  createDealNote
} from "../lib/hubspot";
import { generateDealSummary, updateDealSummary } from "../runtime/summary";
import { evaluateDeadOpportunity } from "../runtime/deadOppEvaluation";
import { QUALIFICATION_STAGE_ID } from "../config/dealStage";
import { checkDealStage } from "../lib/dealStage";
import { runSalesAgent } from "../runtime/salesAgent";
import { createSalesMcpServer } from "../tools/mcp";

const SYSTEM_PROMPT_APPEND =
  "You are a fully autonomous, async-first sales agent. Never propose calls or meetings.\nUse Skills when relevant and follow their instructions. Keep outputs concise.";

const DEFAULT_LIMIT = 100;
const DEFAULT_PIPELINE = null;

type DealRecord = {
  id: string;
  properties?: Record<string, string>;
};

function parseBoolEnv(name: string, defaultValue = false) {
  const value = process.env[name];
  if (!value) return defaultValue;
  return value === "1" || value.toLowerCase() === "true";
}

async function searchClosedLostDeals({
  pipelineId,
  limit,
  fullBatch
}: {
  pipelineId?: string | null;
  limit: number;
  fullBatch: boolean;
}): Promise<DealRecord[]> {
  const filters: Array<Record<string, any>> = [
    { propertyName: "dealstage", operator: "EQ", value: "closedlost" }
  ];

  if (pipelineId) {
    filters.push({ propertyName: "pipeline", operator: "EQ", value: pipelineId });
  }

  if (!fullBatch) {
    filters.push({ propertyName: "last_processed", operator: "NOT_HAS_PROPERTY" });
  }

  const body = {
    filterGroups: [{ filters }],
    properties: [
      "dealname",
      "dealstage",
      "pipeline",
      "closed_lost_reason",
      "notes_last_contacted",
      "last_processed",
      "deal_summary"
    ],
    sorts: [{ propertyName: "notes_last_contacted", direction: "ASCENDING" }],
    limit
  };

  const result = await hubspotRequest<any>("POST", "/crm/v3/objects/deals/search", body);
  return result.results || [];
}

async function getContactForDeal(dealId: string) {
  try {
    const assoc = await hubspotRequest<any>("GET", `/crm/v4/objects/deals/${dealId}/associations/contacts?limit=1`);
    return assoc.results?.[0]?.toObjectId || null;
  } catch {
    return null;
  }
}

function formatLatestComms(summary: any) {
  const latest = Array.isArray(summary?.latestComms) ? summary.latestComms : [];
  if (latest.length === 0) return "- none";
  return latest
    .slice(0, 3)
    .map((entry: any) => {
      const ts = entry?.timestamp || "unknown";
      const direction = entry?.direction || "unknown";
      const type = entry?.type || "unknown";
      const summaryLine = entry?.summary || "";
      return `- [${ts}] ${direction} ${type}${summaryLine ? ` — ${summaryLine}` : ""}`;
    })
    .join("\n");
}

function buildDecisionNote({
  timestamp,
  decision,
  scoring,
  evaluation,
  timingPass,
  lastContactedDate,
  followUpDate,
  summarySnippet,
  reengageStatus
}: {
  timestamp: string;
  decision: string;
  scoring: any;
  evaluation: any;
  timingPass: boolean;
  lastContactedDate: string;
  followUpDate: string | null;
  summarySnippet: string;
  reengageStatus?: string | null;
}) {
  const kbLinks = evaluation?.kbCheck?.links?.length ? evaluation.kbCheck.links.join("\n") : "none";
  const kbStatus = evaluation?.kbCheck?.status || "SKIPPED";
  const kbSummary = evaluation?.kbCheck?.summary || "";
  const blockerLine = evaluation?.hardBlockerReason ? ` (${evaluation.hardBlockerReason})` : "";

  return `Dead Opp Review — ${timestamp}

Decision: ${decision}
Score: ${scoring.total} (threshold: 70)

Key Factors:
- Reason category: ${evaluation?.reasonCategory || "unknown"}
- Timing rule: ${timingPass ? "pass" : "fail"} (notes_last_contacted: ${lastContactedDate})
- Follow-up date: ${followUpDate || "none"}
- KB check: ${kbStatus}

KB Links:
${kbLinks}
${kbSummary ? `\nKB Notes:\n${kbSummary}` : ""}

Summary Snippet:
${summarySnippet}

Rationale:
${evaluation?.reasonSummary || "No summary provided."}
${evaluation?.hardBlocker ? `\nHard Blocker: yes${blockerLine}` : "\nHard Blocker: no"}
${reengageStatus ? `\nRe-engagement: ${reengageStatus}` : ""}`;
}

function buildReengageBody({
  dealName,
  closedLostReason,
  evaluation,
  scoring,
  summarySnippet,
  followUpDate
}: {
  dealName: string;
  closedLostReason: string;
  evaluation: any;
  scoring: any;
  summarySnippet: string;
  followUpDate: string | null;
}) {
  return `DEAD OPPORTUNITY RE-ENGAGEMENT

Deal: ${dealName}
Closed Lost Reason: ${closedLostReason || "Unknown"}
Reason Category: ${evaluation?.reasonCategory || "unknown"}
Score: ${scoring.total} (threshold: 70)
Follow-up Date: ${followUpDate || "none"}

KB Status: ${evaluation?.kbCheck?.status || "SKIPPED"}
KB Links: ${evaluation?.kbCheck?.links?.length ? evaluation.kbCheck.links.join(", ") : "none"}

Latest Comms:
${summarySnippet}

Guidance:
- Explain why we are reaching out again now (timing or resolved feature gap).
- Reference the original blocker and address it if possible.
- Ask 2-3 targeted, async-friendly questions.
- Do not propose calls or meetings.`;
}

async function processDeal({
  deal,
  dryRun,
  mcpServers
}: {
  deal: DealRecord;
  dryRun: boolean;
  mcpServers: Record<string, any>;
}) {
  const dealId = deal.id;
  const dealName = deal.properties?.dealname || "Unknown Deal";
  const closedLostReason = deal.properties?.closed_lost_reason || "";
  const notesLastContacted = deal.properties?.notes_last_contacted || null;

  const dealSummaryResult = await generateDealSummary({
    dealId,
    systemPromptAppend: SYSTEM_PROMPT_APPEND
  });

  const dealSummary = dealSummaryResult.summary || deal.properties?.deal_summary || null;
  if (dealSummaryResult.summary && !dryRun) {
    await updateDealSummary(dealId, dealSummaryResult.summary);
  }

  const evaluationResult = await evaluateDeadOpportunity({
    dealId,
    closedLostReason,
    lastContacted: notesLastContacted,
    dealSummary,
    systemPromptAppend: SYSTEM_PROMPT_APPEND,
    mcpServers
  });

  const lastContactedDate = notesLastContacted
    ? (() => {
        const parsed = Number(notesLastContacted);
        return Number.isFinite(parsed) ? new Date(parsed).toISOString() : "unknown";
      })()
    : "unknown";
  const summarySnippet = formatLatestComms(dealSummary);

  let reengageStatus: string | null = null;

  if (!dryRun && evaluationResult.decision === "RE-ENGAGE") {
    try {
      await updateDealProperties(dealId, { dealstage: QUALIFICATION_STAGE_ID });
      await checkDealStage(dealId, { createTasks: true });

      const contactId = await getContactForDeal(dealId);
      await runSalesAgent({
        source: "stale_deal",
        type: "email",
        subject: `Re-engage: ${dealName}`,
        body: buildReengageBody({
          dealName,
          closedLostReason,
          evaluation: evaluationResult.evaluation,
          scoring: evaluationResult.scoring,
          summarySnippet,
          followUpDate: evaluationResult.followUpDate
        }),
        dealId,
        contactId: contactId || undefined
      });
      reengageStatus = "draft email created and deal reset to Qualification";
    } catch (error: any) {
      reengageStatus = `failed: ${error?.message || error}`;
    }
  }

  const noteBody = buildDecisionNote({
    timestamp: new Date().toISOString(),
    decision: evaluationResult.decision,
    scoring: evaluationResult.scoring,
    evaluation: evaluationResult.evaluation,
    timingPass: evaluationResult.timingPass,
    lastContactedDate,
    followUpDate: evaluationResult.followUpDate,
    summarySnippet,
    reengageStatus
  });

  if (!dryRun) {
    await createDealNote(dealId, noteBody);
    await updateDealProperties(dealId, { last_processed: new Date().toISOString() });
  }

  return {
    dealId,
    dealName,
    decision: evaluationResult.decision,
    score: evaluationResult.scoring.total,
    timingPass: evaluationResult.timingPass,
    lastContactedDays: evaluationResult.lastContactedDays
  };
}

export async function runDeadOpportunitiesCron() {
  loadEnv();

  const limitRaw = Number.parseInt(process.env.DEAD_OPP_LIMIT || String(DEFAULT_LIMIT), 10);
  const limit = Number.isFinite(limitRaw) ? limitRaw : DEFAULT_LIMIT;
  const pipelineId = process.env.DEAD_OPP_PIPELINE_ID || DEFAULT_PIPELINE;
  const fullBatch = process.argv.includes("--full-batch") || parseBoolEnv("DEAD_OPP_FULL_BATCH");
  const dryRun = process.argv.includes("--dry-run") || parseBoolEnv("DEAD_OPP_DRY_RUN");

  console.log("\n========================================");
  console.log("DEAD OPPORTUNITIES CRON");
  console.log(`Mode: ${fullBatch ? "FULL BATCH" : "INCREMENTAL"}`);
  console.log(`Limit: ${limit}`);
  console.log(`Dry run: ${dryRun ? "YES" : "NO"}`);
  console.log("========================================\n");

  const deals = await searchClosedLostDeals({ pipelineId, limit, fullBatch });
  console.log(`Found ${deals.length} closed-lost deal(s) to evaluate\n`);

  const mcpServers = { "sales-crm": createSalesMcpServer() };
  const results: any[] = [];

  for (const deal of deals) {
    const name = deal.properties?.dealname || "Unknown Deal";
    console.log(`Processing: ${name} (${deal.id})`);
    try {
      const result = await processDeal({ deal, dryRun, mcpServers });
      console.log(`  ✓ Decision: ${result.decision} (score ${result.score})\n`);
      results.push(result);
    } catch (error: any) {
      console.error(`  ✗ Failed: ${error?.message || error}\n`);
      results.push({ dealId: deal.id, dealName: name, error: error?.message || String(error) });
    }
  }

  console.log("========================================");
  console.log(`Processed: ${results.length} deal(s)`);
  console.log("========================================\n");

  return { processed: results.length, deals: results };
}

function isMainModule() {
  if (!process.argv[1]) return false;
  const entry = resolve(process.argv[1]);
  const current = resolve(fileURLToPath(import.meta.url));
  return entry === current;
}

if (isMainModule()) {
  runDeadOpportunitiesCron()
    .then((result) => {
      console.log("Result:", JSON.stringify(result, null, 2));
      process.exit(0);
    })
    .catch((error) => {
      console.error("Cron failed:", error?.message || error);
      process.exit(1);
    });
}
