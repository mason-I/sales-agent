import { existsSync, readFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { createTask, fetchDealTaskIds, fetchTask, updateTask } from "../lib/hubspot";

export type SdkTaskStatus = "pending" | "in_progress" | "completed";
export type HubSpotTaskStatus = "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";

export type TaskLifecycleEvent = {
  taskId: string;
  subject: string | null;
  statusFrom: string | null;
  statusTo: string;
  timestamp: string;
  hubspotTaskId?: string | null;
  hubspotStatus?: string | null;
  hubspotAction?: "created" | "updated" | "skipped";
  error?: string | null;
};

type TaskSummary = {
  subject?: string | null;
  description?: string | null;
};

const HUBSPOT_TASK_ASSOCIATION_TYPE_ID = 216;
const SDK_TASK_TAG_PREFIX = "SDK_TASK_ID:";

function normalizeTaskListId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "-");
}

function getTaskListDir(taskListId: string): string {
  return join(homedir(), ".claude", "tasks", normalizeTaskListId(taskListId));
}

export function readTaskSummaryFromDisk(taskListId: string, taskId: string): TaskSummary | null {
  if (!taskListId) return null;
  const filePath = join(getTaskListDir(taskListId), `${normalizeTaskListId(taskId)}.json`);
  if (!existsSync(filePath)) return null;

  try {
    const parsed = JSON.parse(readFileSync(filePath, "utf8"));
    return {
      subject: typeof parsed.subject === "string" ? parsed.subject : null,
      description: typeof parsed.description === "string" ? parsed.description : null
    };
  } catch {
    return null;
  }
}

function buildTaskTag(taskId: string, summary: string): string {
  return `${SDK_TASK_TAG_PREFIX}${taskId}: ${summary}`.trim();
}

function extractSdkTaskId(body: string | null | undefined): string | null {
  if (!body) return null;
  const match = body.match(/SDK_TASK_ID:([^\s:]+)\s*:/);
  return match ? match[1] : null;
}

function coerceSummary(subject?: string | null): string {
  const trimmed = (subject || "").trim();
  if (!trimmed) return "Task update";
  return trimmed.length > 140 ? `${trimmed.slice(0, 137)}...` : trimmed;
}

export function mapSdkToHubSpotStatus(status: SdkTaskStatus): HubSpotTaskStatus {
  if (status === "in_progress") return "IN_PROGRESS";
  if (status === "completed") return "COMPLETED";
  return "NOT_STARTED";
}

export async function findHubSpotTaskForSdkId(
  dealId: string,
  sdkTaskId: string
): Promise<{ id: string; status: string | null; subject: string | null; body: string | null } | null> {
  const ids = await fetchDealTaskIds(dealId);
  for (const taskId of ids) {
    try {
      const task = await fetchTask(String(taskId), ["hs_task_subject", "hs_task_body", "hs_task_status"]);
      const body = task.properties?.hs_task_body || "";
      if (body.includes(`${SDK_TASK_TAG_PREFIX}${sdkTaskId}:`)) {
        return {
          id: String(taskId),
          status: task.properties?.hs_task_status || null,
          subject: task.properties?.hs_task_subject || null,
          body: body || null
        };
      }
    } catch {
      // ignore individual task failures
    }
  }
  return null;
}

export async function mirrorSdkTaskToHubSpot(params: {
  dealId: string;
  sdkTaskId: string;
  sdkStatus: SdkTaskStatus;
  summary: string;
  description?: string | null;
}): Promise<{ hubspotTaskId?: string | null; hubspotStatus?: string | null; action: "created" | "updated" | "skipped"; error?: string | null }> {
  const { dealId, sdkTaskId, sdkStatus, summary, description } = params;
  if (!dealId) {
    return { action: "skipped", error: "Missing dealId" };
  }

  const hubspotStatus = mapSdkToHubSpotStatus(sdkStatus);
  const tag = buildTaskTag(sdkTaskId, summary);
  const body = description ? `${tag}\n\n${description}` : tag;

  try {
    const existing = await findHubSpotTaskForSdkId(dealId, sdkTaskId);
    if (existing) {
      await updateTask(existing.id, { hs_task_status: hubspotStatus });
      return { action: "updated", hubspotTaskId: existing.id, hubspotStatus };
    }

    const properties: Record<string, string> = {
      hs_task_subject: summary,
      hs_task_body: body,
      hs_task_status: hubspotStatus,
      hs_task_priority: "MEDIUM"
    };
    const associations = [
      {
        to: { id: dealId },
        types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: HUBSPOT_TASK_ASSOCIATION_TYPE_ID }]
      }
    ];
    const result = await createTask(properties, associations);
    const createdId = result?.id || result?.data?.id || result?.properties?.hs_object_id;
    return { action: "created", hubspotTaskId: createdId ? String(createdId) : null, hubspotStatus };
  } catch (error: any) {
    return { action: "skipped", error: error?.message || String(error) };
  }
}

export async function validateTaskMirror(params: {
  dealId: string;
  expected: Array<{ taskId: string; status: SdkTaskStatus }>;
}): Promise<{ missing: string[]; mismatched: Array<{ taskId: string; expected: string; actual: string | null }> }> {
  const { dealId, expected } = params;
  const ids = await fetchDealTaskIds(dealId);
  const taskMap = new Map<string, { status: string | null }>();

  for (const taskId of ids) {
    try {
      const task = await fetchTask(String(taskId), ["hs_task_body", "hs_task_status"]);
      const sdkTaskId = extractSdkTaskId(task.properties?.hs_task_body || "");
      if (sdkTaskId) {
        taskMap.set(sdkTaskId, { status: task.properties?.hs_task_status || null });
      }
    } catch {
      // skip
    }
  }

  const missing: string[] = [];
  const mismatched: Array<{ taskId: string; expected: string; actual: string | null }> = [];
  for (const item of expected) {
    const mapped = taskMap.get(item.taskId);
    if (!mapped) {
      missing.push(item.taskId);
      continue;
    }
    const expectedStatus = mapSdkToHubSpotStatus(item.status);
    if (mapped.status !== expectedStatus) {
      mismatched.push({ taskId: item.taskId, expected: expectedStatus, actual: mapped.status });
    }
  }

  return { missing, mismatched };
}
