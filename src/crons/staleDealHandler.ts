import { fileURLToPath } from "url";
import { resolve } from "path";
import { loadEnv } from "../lib/env";
import {
  hubspotRequest,
  fetchDealTaskIds,
  fetchTask
} from "../lib/hubspot";
import { runSalesAgent } from "../runtime/salesAgent";

type DealRecord = {
  id: string;
  properties?: Record<string, string>;
};

type IncompleteTask = {
  id: string;
  subject: string;
  status: string;
};

function parseList(value?: string): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseBoolEnv(name: string, defaultValue = false) {
  const value = process.env[name];
  if (!value) return defaultValue;
  return value === "1" || value.toLowerCase() === "true";
}

function daysSinceActivity(activityTimestamp?: string) {
  if (!activityTimestamp) return Infinity;
  const parsed = Number(activityTimestamp);
  if (Number.isNaN(parsed)) return Infinity;
  return Math.floor((Date.now() - parsed) / (1000 * 60 * 60 * 24));
}

async function searchStaleDeals({
  daysStale,
  activityProperty,
  excludeStages,
  pipelineId,
  limit
}: {
  daysStale: number;
  activityProperty: string;
  excludeStages: string[];
  pipelineId?: string | null;
  limit: number;
}): Promise<DealRecord[]> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysStale);
  const cutoffTimestamp = cutoffDate.getTime();

  const filters: Array<Record<string, any>> = [
    { propertyName: activityProperty, operator: "LT", value: String(cutoffTimestamp) }
  ];

  if (excludeStages.length > 0) {
    filters.push({ propertyName: "dealstage", operator: "NOT_IN", values: excludeStages });
  }

  if (pipelineId) {
    filters.push({ propertyName: "pipeline", operator: "EQ", value: pipelineId });
  }

  const body = {
    filterGroups: [{ filters }],
    properties: [
      "dealname",
      "dealstage",
      "pipeline",
      "deal_summary",
      "sw_primary_pain",
      "amount",
      activityProperty
    ],
    sorts: [{ propertyName: activityProperty, direction: "ASCENDING" }],
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

async function getIncompleteTasksForDeal(dealId: string): Promise<IncompleteTask[]> {
  const taskIds = await fetchDealTaskIds(dealId);
  const incomplete: IncompleteTask[] = [];
  for (const taskId of taskIds) {
    try {
      const task = await fetchTask(taskId, ["hs_task_subject", "hs_task_status"]);
      const status = task.properties?.hs_task_status;
      if (status === "NOT_STARTED" || status === "IN_PROGRESS") {
        incomplete.push({
          id: task.id,
          subject: task.properties?.hs_task_subject || "Untitled Task",
          status
        });
      }
    } catch {
      // ignore failed task fetches
    }
  }
  return incomplete;
}

function buildStaleDealBody({
  deal,
  activityProperty,
  incompleteTasks
}: {
  deal: DealRecord;
  activityProperty: string;
  incompleteTasks: IncompleteTask[];
}) {
  const dealName = deal.properties?.dealname || "Unknown Deal";
  const lastActivity = deal.properties?.[activityProperty];
  const daysInactive = daysSinceActivity(lastActivity);

  const taskLines = incompleteTasks.length
    ? incompleteTasks.map((t) => `- ${t.subject} (${t.status})`).join("\n")
    : "No pending tasks.";

  return `STALE DEAL REACTIVATION REQUIRED

Deal: ${dealName}
Days since last activity: ${Number.isFinite(daysInactive) ? daysInactive : "unknown"}
Last activity timestamp (${activityProperty}): ${lastActivity || "unknown"}
Primary pain: ${deal.properties?.sw_primary_pain || "Unknown"}
Amount: ${deal.properties?.amount || "Not set"}

INCOMPLETE TASKS:
${taskLines}

Guidance:
- If incomplete tasks exist, prioritize executing or updating them before creating new tasks.
- If no tasks exist, propose light re-engagement and missing-info discovery.
- Use the deal summary for the latest communication context.
- Avoid proposing meetings or calls.`;
}

async function processDeal({
  deal,
  activityProperty,
  dryRun
}: {
  deal: DealRecord;
  activityProperty: string;
  dryRun: boolean;
}) {
  const dealId = deal.id;
  const dealName = deal.properties?.dealname || "Unknown Deal";
  const lastActivity = deal.properties?.[activityProperty];
  const daysInactive = daysSinceActivity(lastActivity);

  const incompleteTasks = await getIncompleteTasksForDeal(dealId);
  const contactId = await getContactForDeal(dealId);

  const body = buildStaleDealBody({
    deal,
    activityProperty,
    incompleteTasks
  });

  if (dryRun) {
    return {
      dealId,
      dealName,
      lastActivityDays: Number.isFinite(daysInactive) ? daysInactive : null,
      incompleteTasks: incompleteTasks.length,
      dryRun: true
    };
  }

  const result = await runSalesAgent({
    source: "stale_deal",
    type: "email",
    subject: `Stale deal follow-up: ${dealName}`,
    body,
    dealId,
    contactId: contactId || undefined
  });
  
  return {
    dealId,
    dealName,
    lastActivityDays: Number.isFinite(daysInactive) ? daysInactive : null,
    incompleteTasks: incompleteTasks.length,
    success: result.success,
    error: result.error || null
  };
}

export async function runStaleDealCron() {
  loadEnv();

  const daysStaleRaw = Number.parseInt(process.env.DAYS_STALE || "3", 10);
  const daysStale = Number.isFinite(daysStaleRaw) ? daysStaleRaw : 3;
  const activityProperty = process.env.STALE_ACTIVITY_PROPERTY || "notes_last_updated";
  const excludeStages = ["closedwon", "closedlost", ...parseList(process.env.EXCLUDE_DEAL_STAGES)];
  const pipelineId = process.env.PIPELINE_ID || null;
  const limitRaw = Number.parseInt(process.env.MAX_DEALS || "100", 10);
  const limit = Number.isFinite(limitRaw) ? limitRaw : 100;
  const dryRun = process.argv.includes("--dry-run") || parseBoolEnv("DRY_RUN");

  console.log("\n========================================");
  console.log("STALE DEAL HANDLER CRON");
  console.log(`Threshold: ${daysStale} days`);
  console.log(`Activity property: ${activityProperty}`);
  console.log(`Mode: ${dryRun ? "DRY RUN" : "LIVE"}`);
  console.log("========================================\n");

  const staleDeals = await searchStaleDeals({
    daysStale,
    activityProperty,
    excludeStages,
    pipelineId,
    limit
  });

  console.log(`Found ${staleDeals.length} stale deal(s)\n`);

  const results: any[] = [];
  for (const deal of staleDeals) {
    const dealName = deal.properties?.dealname || "Unknown Deal";
    const lastActivity = deal.properties?.[activityProperty];
    const daysInactive = daysSinceActivity(lastActivity);

    console.log(`Processing: ${dealName} (${deal.id})`);
    console.log(`  Last activity: ${Number.isFinite(daysInactive) ? `${daysInactive} days ago` : "unknown"}`);

    try {
      const result = await processDeal({
        deal,
        activityProperty,
        dryRun
      });
      if (dryRun) {
        console.log("  [DRY RUN] Would invoke agent\n");
      } else {
        console.log(`  ✓ Completed${result.error ? ` (error: ${result.error})` : ""}\n`);
      }
      results.push(result);
    } catch (error: any) {
      console.error(`  ✗ Failed: ${error?.message || error}\n`);
      results.push({
        dealId: deal.id,
        dealName,
        error: error?.message || String(error)
      });
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
  runStaleDealCron()
    .then((result) => {
      console.log("Result:", JSON.stringify(result, null, 2));
      process.exit(0);
    })
    .catch((error) => {
      console.error("Cron failed:", error?.message || error);
      process.exit(1);
    });
}
