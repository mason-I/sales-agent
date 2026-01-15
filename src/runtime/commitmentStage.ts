import { updateDealProperties, fetchDealProperties, createDealNote } from "../lib/hubspot";
import {
  STAGE_ORDER,
  STAGE_NAMES,
  DISCOVERY_STAGE_ID,
  REQUIREMENT_SCOPING_STAGE_ID,
  ESTABLISHED_TIMELINE_STAGE_ID,
  AGENT_COUNT_STAGE_ID,
  SUPPORT_CHANNELS_STAGE_ID,
  PRICING_DISCUSSED_STAGE_ID,
  SELECTED_TIER_STAGE_ID
} from "../config/dealStage";
import type { CommitmentArtifacts, DraftEvidence, DerivedCommitmentState } from "./commitment";

function isNonEmpty(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  return true;
}

function isPositiveNumber(value: unknown): boolean {
  const num = Number(value);
  return Number.isFinite(num) && num > 0;
}

type StageCheck = {
  ok: boolean;
  missing: string[];
  reason: string;
};

function checkStageRequirements({
  stageId,
  properties,
  artifacts,
  draftEvidence
}: {
  stageId: string;
  properties: Record<string, any>;
  artifacts: CommitmentArtifacts;
  draftEvidence?: DraftEvidence | null;
}): StageCheck {
  switch (stageId) {
    case DISCOVERY_STAGE_ID:
      return {
        ok: isNonEmpty(properties.sw_primary_pain),
        missing: isNonEmpty(properties.sw_primary_pain) ? [] : ["sw_primary_pain"],
        reason: "Primary pain point required"
      };
    case REQUIREMENT_SCOPING_STAGE_ID:
      return {
        ok: isNonEmpty(properties.key_challenges) && isPositiveNumber(properties.ticket_volume_per_month),
        missing: [
          !isNonEmpty(properties.key_challenges) ? "key_challenges" : null,
          !isPositiveNumber(properties.ticket_volume_per_month) ? "ticket_volume_per_month" : null
        ].filter(Boolean) as string[],
        reason: "Scope & impact required"
      };
    case ESTABLISHED_TIMELINE_STAGE_ID:
      return {
        ok: isNonEmpty(properties.timeline_for_change),
        missing: isNonEmpty(properties.timeline_for_change) ? [] : ["timeline_for_change"],
        reason: "Timeline required"
      };
    case AGENT_COUNT_STAGE_ID:
      return {
        ok: isPositiveNumber(properties.agents_required),
        missing: isPositiveNumber(properties.agents_required) ? [] : ["agents_required"],
        reason: "Agent count required"
      };
    case SUPPORT_CHANNELS_STAGE_ID:
      return {
        ok: isNonEmpty(properties.support_channels),
        missing: isNonEmpty(properties.support_channels) ? [] : ["support_channels"],
        reason: "Support channels required"
      };
    case PRICING_DISCUSSED_STAGE_ID:
      return {
        ok: Boolean(draftEvidence?.pricingIncluded),
        missing: draftEvidence?.pricingIncluded ? [] : ["pricing_sent"],
        reason: "Pricing must be sent in the email"
      };
    case SELECTED_TIER_STAGE_ID:
      return {
        ok: artifacts.lineItems > 0,
        missing: artifacts.lineItems > 0 ? [] : ["line_items"],
        reason: "Line items must be created"
      };
    case "contractsent":
      return {
        ok: Boolean(artifacts.invoiceId) && Boolean(draftEvidence?.invoiceLinkIncluded),
        missing: [
          !artifacts.invoiceId ? "invoice_created" : null,
          !draftEvidence?.invoiceLinkIncluded ? "invoice_link_sent" : null
        ].filter(Boolean) as string[],
        reason: "Invoice must be created and link sent"
      };
    case "closedwon":
      return {
        ok: artifacts.invoicePaid,
        missing: artifacts.invoicePaid ? [] : ["invoice_paid"],
        reason: "Invoice must be paid in HubSpot"
      };
    default:
      return { ok: true, missing: [], reason: "No requirements" };
  }
}

function stageIndex(stageId: string | null | undefined): number {
  if (!stageId) return -1;
  return STAGE_ORDER.indexOf(stageId);
}

export function computeCommitmentGap({
  currentStageId,
  properties,
  artifacts
}: {
  currentStageId: string;
  properties: Record<string, any>;
  artifacts: CommitmentArtifacts;
}) {
  const currentIndex = stageIndex(currentStageId);
  if (currentIndex === -1 || currentIndex >= STAGE_ORDER.length - 1) return null;
  const nextStage = STAGE_ORDER[currentIndex + 1];
  const gate = checkStageRequirements({ stageId: nextStage, properties, artifacts, draftEvidence: null });
  if (gate.ok) return null;

  return {
    nextStage: { id: nextStage, name: STAGE_NAMES[nextStage] || nextStage },
    missingFields: gate.missing,
    instruction: gate.reason
  };
}

export async function advanceCommitmentStage({
  dealId,
  currentStageId,
  derivedState,
  properties,
  artifacts,
  draftEvidence,
  requireDraftForAdvance,
  lastDraft
}: {
  dealId: string;
  currentStageId: string;
  derivedState: DerivedCommitmentState;
  properties: Record<string, any>;
  artifacts: CommitmentArtifacts;
  draftEvidence?: DraftEvidence | null;
  requireDraftForAdvance: boolean;
  lastDraft?: { subject: string; body: string } | null;
}) {
  const currentIndex = stageIndex(currentStageId);
  const candidateIndex = stageIndex(derivedState.commitmentCurrent);
  let targetIndex = Math.max(currentIndex, candidateIndex);

  if (draftEvidence?.pricingIncluded) {
    targetIndex = Math.max(targetIndex, stageIndex(PRICING_DISCUSSED_STAGE_ID));
  }
  if (draftEvidence?.invoiceLinkIncluded && artifacts.invoiceId) {
    targetIndex = Math.max(targetIndex, stageIndex("contractsent"));
  }
  if (artifacts.invoicePaid) {
    targetIndex = Math.max(targetIndex, stageIndex("closedwon"));
  }

  if (derivedState.commitmentCurrent === "closedlost" && currentStageId !== "closedlost") {
    if (requireDraftForAdvance && !lastDraft) {
      return { advanced: false, blockedReason: "No reply logged before closing lost" };
    }
    const reason = derivedState.buyerIntent === "stop_contact" ? "Prospect requested no further contact" : "Prospect indicated no interest";
    try {
      await updateDealProperties(dealId, { dealstage: "closedlost", closed_lost_reason: reason });
    } catch (error: any) {
      await createDealNote(dealId, `Failed to update closed lost stage: ${error.message || error}`);
      return { advanced: false, blockedReason: "Failed to update closed lost stage" };
    }
    return {
      advanced: true,
      from: { id: currentStageId, name: STAGE_NAMES[currentStageId] || currentStageId },
      to: { id: "closedlost", name: STAGE_NAMES.closedlost || "Closed Lost" }
    };
  }

  if (currentIndex === -1 || targetIndex <= currentIndex) {
    return { advanced: false };
  }

  let nextStageId = currentStageId;
  let blockedReason: string | null = null;

  for (let i = currentIndex + 1; i <= targetIndex; i++) {
    const stageId = STAGE_ORDER[i];
    const requiresDraft = stageId === PRICING_DISCUSSED_STAGE_ID || stageId === "contractsent";
    if (requiresDraft && requireDraftForAdvance && !lastDraft) {
      blockedReason = "No reply logged for email-dependent stage";
      break;
    }

    const gate = checkStageRequirements({ stageId, properties, artifacts, draftEvidence });
    if (gate.ok) {
      nextStageId = stageId;
      continue;
    }
    blockedReason = gate.reason;
    break;
  }

  if (nextStageId === currentStageId) {
    return { advanced: false, blockedReason: blockedReason || undefined };
  }

  try {
    await updateDealProperties(dealId, { dealstage: nextStageId });
  } catch (error: any) {
    await createDealNote(dealId, `Failed to update deal stage: ${error.message || error}`);
    return { advanced: false, blockedReason: "Failed to update deal stage" };
  }

  return {
    advanced: true,
    from: { id: currentStageId, name: STAGE_NAMES[currentStageId] || currentStageId },
    to: { id: nextStageId, name: STAGE_NAMES[nextStageId] || nextStageId }
  };
}

export async function fetchStageProperties(dealId: string) {
  return await fetchDealProperties(dealId, [
    "dealstage",
    "sw_primary_pain",
    "key_challenges",
    "timeline_for_change",
    "agents_required",
    "support_channels",
    "ticket_volume_per_month",
    "closed_lost_reason"
  ]);
}
