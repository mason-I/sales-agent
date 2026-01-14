export const QUALIFICATION_STAGE_ID = "2130118129";
export const DISCOVERY_STAGE_ID = "2182866374";
export const REQUIREMENT_SCOPING_STAGE_ID = "2185655765";

export const STAGE_ORDER = [
  QUALIFICATION_STAGE_ID,
  DISCOVERY_STAGE_ID,
  REQUIREMENT_SCOPING_STAGE_ID,
  "contractsent",
  "closedwon"
];

export const STAGE_NAMES: Record<string, string> = {
  [QUALIFICATION_STAGE_ID]: "Qualification",
  [DISCOVERY_STAGE_ID]: "Discovery",
  [REQUIREMENT_SCOPING_STAGE_ID]: "Requirement Scoping",
  contractsent: "Proposal Sent",
  closedwon: "Closed Won",
  closedlost: "Closed Lost"
};

export const STAGE_GATES: Record<string, { required: string[]; description: string }> = {
  [DISCOVERY_STAGE_ID]: {
    required: ["sw_primary_pain"],
    description: "Primary pain point identified"
  },
  [REQUIREMENT_SCOPING_STAGE_ID]: {
    required: [
      "sw_primary_pain",
      "key_challenges",
      "amount",
      "timeline_for_change",
      "agents_required",
      "support_channels",
      "ticket_volume_per_month"
    ],
    description: "Requirement scoping complete (pain, challenges, budget, timeline, sizing)"
  },
  contractsent: {
    required: ["has_line_items"],
    description: "Quote with line items created"
  },
  closedwon: {
    required: ["invoice_paid"],
    description: "Invoice marked as paid"
  },
  closedlost: {
    required: ["closed_lost_reason"],
    description: "Lost reason documented"
  }
};
