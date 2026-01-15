import { hubspotRequest, fetchDealProperties, createTask } from "./hubspot";
import { STAGE_GATES, STAGE_NAMES, STAGE_ORDER } from "../config/dealStage";

async function checkDealInvoicePaid(dealId: string) {
  try {
    const assoc = await hubspotRequest<any>(
      "GET",
      `/crm/v4/objects/deals/${dealId}/associations/invoices?limit=100`
    );
    const invoiceIds = assoc.results?.map((r: any) => r.toObjectId) || [];
    if (invoiceIds.length === 0) return false;

    for (const invoiceId of invoiceIds) {
      try {
        const invoice = await hubspotRequest<any>("GET", `/crm/v3/objects/invoices/${invoiceId}?properties=hs_invoice_status`);
        const status = String(invoice.properties?.hs_invoice_status || "").toLowerCase();
        if (status === "invoice_paid") return true;
      } catch {
        // ignore
      }
    }
    return false;
  } catch {
    return false;
  }
}

function calculateProgressionGap(currentStage: string, deal: Record<string, any>, hasLineItems: boolean, invoicePaid: boolean) {
  const currentIndex = STAGE_ORDER.indexOf(currentStage);
  if (currentIndex === -1 || currentIndex >= STAGE_ORDER.length - 1) return null;

  const nextStage = STAGE_ORDER[currentIndex + 1];
  const gate = STAGE_GATES[nextStage];
  if (!gate) return null;

  const signals: Record<string, boolean> = {
    sw_primary_pain: Boolean(deal?.sw_primary_pain),
    key_challenges: Boolean(deal?.key_challenges),
    amount: Boolean(deal?.amount && Number(deal.amount) > 0),
    timeline_for_change: Boolean(deal?.timeline_for_change),
    agents_required: Boolean(deal?.agents_required && Number(deal.agents_required) > 0),
    support_channels: Boolean(deal?.support_channels),
    ticket_volume_per_month: Boolean(deal?.ticket_volume_per_month && Number(deal.ticket_volume_per_month) > 0),
    has_line_items: hasLineItems,
    invoice_paid: invoicePaid,
    closed_lost_reason: Boolean(deal?.closed_lost_reason)
  };

  const missing = gate.required.filter((req) => !signals[req]);
  if (missing.length === 0) return null;

  const fieldLabels: Record<string, string> = {
    sw_primary_pain: "primary pain point",
    key_challenges: "key challenges",
    amount: "budget/amount",
    timeline_for_change: "timeline for change",
    agents_required: "agent count",
    support_channels: "support channels",
    ticket_volume_per_month: "ticket volume per month",
    has_line_items: "quote with line items",
    invoice_paid: "invoice paid",
    closed_lost_reason: "lost reason"
  };

  const missingLabels = missing.map((f) => fieldLabels[f] ?? f);
  const currentName = STAGE_NAMES[currentStage] ?? currentStage;
  const nextName = STAGE_NAMES[nextStage] ?? nextStage;

  return {
    currentStage,
    currentStageName: currentName,
    nextStage,
    nextStageName: nextName,
    missingFields: missing,
    instruction: `To move from ${currentName} to ${nextName}, gather: ${missingLabels.join(", ")}.`
  };
}

async function createTaskForMissingField(dealId: string, contactId: string | null, missingField: string, nextStageName: string) {
  const fieldLabels: Record<string, string> = {
    sw_primary_pain: "Identify primary pain point",
    key_challenges: "Gather key challenges",
    amount: "Determine budget/amount",
    timeline_for_change: "Clarify timeline for change",
    agents_required: "Capture required agent count",
    support_channels: "Confirm required support channels",
    ticket_volume_per_month: "Capture ticket volume per month",
    has_line_items: "Create quote with line items",
    invoice_paid: "Confirm invoice is paid",
    closed_lost_reason: "Document lost reason"
  };

  const taskTitle = fieldLabels[missingField] || `Gather ${missingField}`;
  const taskBody = `Required to advance deal to ${nextStageName} stage. Missing field: ${missingField}`;

  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 3);

  const properties: Record<string, string> = {
    hs_task_subject: taskTitle,
    hs_task_body: taskBody,
    hs_task_status: "NOT_STARTED",
    hs_task_priority: "MEDIUM",
    hs_timestamp: dueDate.toISOString()
  };

  const associations: any[] = [];
  if (dealId) {
    associations.push({
      to: { id: dealId },
      types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 216 }]
    });
  }
  if (contactId) {
    associations.push({
      to: { id: contactId },
      types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 204 }]
    });
  }

  return await createTask(properties, associations);
}

async function getContactForDeal(dealId: string) {
  try {
    const res = await hubspotRequest<any>("GET", `/crm/v4/objects/deals/${dealId}/associations/contacts?limit=1`);
    return res.results?.[0]?.id ?? null;
  } catch {
    return null;
  }
}

async function fetchDealGateState(dealId: string, invoicePaidHint = false) {
  const properties = [
    "dealstage",
    "sw_primary_pain",
    "key_challenges",
    "amount",
    "timeline_for_change",
    "agents_required",
    "support_channels",
    "ticket_volume_per_month",
    "closed_lost_reason",
    "hs_num_of_associated_line_items"
  ];

  const freshDeal = await fetchDealProperties(dealId, properties);
  const dealStageId = String(freshDeal.dealstage ?? "2130118129");
  const dealStageName = STAGE_NAMES[dealStageId] ?? dealStageId;
  const hasLineItems = Number(freshDeal.hs_num_of_associated_line_items ?? 0) > 0;
  const invoicePaid = invoicePaidHint ? true : await checkDealInvoicePaid(dealId);
  const gap = calculateProgressionGap(dealStageId, freshDeal, hasLineItems, invoicePaid);

  return { dealStageId, dealStageName, progressionGap: gap, invoicePaid };
}

async function advanceDealStage(dealId: string, currentStageId: string) {
  const currentIndex = STAGE_ORDER.indexOf(currentStageId);
  if (currentIndex === -1 || currentIndex >= STAGE_ORDER.length - 1) return null;

  const nextStageId = STAGE_ORDER[currentIndex + 1];
  const nextStageName = STAGE_NAMES[nextStageId] ?? nextStageId;

  await hubspotRequest("PATCH", `/crm/v3/objects/deals/${dealId}`, {
    properties: { dealstage: nextStageId }
  });

  return { stageId: nextStageId, stageName: nextStageName };
}

export async function checkDealStage(dealId: string, options: { createTasks?: boolean; contactId?: string | null } = {}) {
  if (!dealId) throw new Error("dealId is required");

  const { createTasks = true, contactId: providedContactId = null } = options;

  const gateState = await fetchDealGateState(dealId);

  const progressionGap = gateState.progressionGap;
  const createdTasks: Array<{ field: string; taskId?: string; title?: string; success: boolean; error?: string }> = [];

  if (progressionGap && createTasks && progressionGap.missingFields.length > 0) {
    let contactId = providedContactId;
    if (!contactId) contactId = await getContactForDeal(dealId);

    for (const missingField of progressionGap.missingFields) {
      try {
        const task = await createTaskForMissingField(dealId, contactId, missingField, progressionGap.nextStageName);
        createdTasks.push({
          field: missingField,
          taskId: task.id,
          title: task.properties?.hs_task_subject || `Gather ${missingField}`,
          success: true
        });
      } catch (error: any) {
        createdTasks.push({
          field: missingField,
          success: false,
          error: error.message
        });
      }
    }
  }

  return {
    dealId,
    currentStage: { id: gateState.dealStageId, name: gateState.dealStageName },
    canAdvance: progressionGap === null,
    progressionGap: progressionGap
      ? {
          nextStage: { id: progressionGap.nextStage, name: progressionGap.nextStageName },
          missingFields: progressionGap.missingFields,
          instruction: progressionGap.instruction
        }
      : null,
    createdTasks: createdTasks.length > 0 ? createdTasks : undefined
  };
}
