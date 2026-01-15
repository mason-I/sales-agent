// Commitment-based stages (HubSpot dealstage mirrors commitments)
export const QUALIFICATION_STAGE_ID = "2130118129"; // Expressed Commercial Intent
export const DISCOVERY_STAGE_ID = "2182866374"; // Admitted Pain / Gap
export const REQUIREMENT_SCOPING_STAGE_ID = "2185655765"; // Defined Scope & Impact
export const ESTABLISHED_TIMELINE_STAGE_ID = "2388431315";
export const AGENT_COUNT_STAGE_ID = "2390248940";
export const SUPPORT_CHANNELS_STAGE_ID = "2388431316";
export const PRICING_DISCUSSED_STAGE_ID = "2388431317";
export const SELECTED_TIER_STAGE_ID = "2387718587";

export const STAGE_ORDER = [
  QUALIFICATION_STAGE_ID,
  DISCOVERY_STAGE_ID,
  REQUIREMENT_SCOPING_STAGE_ID,
  ESTABLISHED_TIMELINE_STAGE_ID,
  AGENT_COUNT_STAGE_ID,
  SUPPORT_CHANNELS_STAGE_ID,
  PRICING_DISCUSSED_STAGE_ID,
  SELECTED_TIER_STAGE_ID,
  "contractsent",
  "closedwon"
];

export const STAGE_NAMES: Record<string, string> = {
  [QUALIFICATION_STAGE_ID]: "Expressed Commercial Intent",
  [DISCOVERY_STAGE_ID]: "Admitted Pain / Gap",
  [REQUIREMENT_SCOPING_STAGE_ID]: "Defined Scope & Impact",
  [ESTABLISHED_TIMELINE_STAGE_ID]: "Established Timeline",
  [AGENT_COUNT_STAGE_ID]: "Confirmed Agent Count",
  [SUPPORT_CHANNELS_STAGE_ID]: "Confirmed Support Channels",
  [PRICING_DISCUSSED_STAGE_ID]: "Pricing Discussed",
  [SELECTED_TIER_STAGE_ID]: "Selected Tier",
  contractsent: "Quote Sent",
  closedwon: "Paid",
  closedlost: "Closed Lost"
};

// Legacy stage-gate map retained for reference but will be superseded by
// derived-state commitment checks in the new flow.
export const STAGE_GATES: Record<string, { required: string[]; description: string }> = {
  [DISCOVERY_STAGE_ID]: {
    required: ["sw_primary_pain"],
    description: "Primary pain point identified"
  },
  [REQUIREMENT_SCOPING_STAGE_ID]: {
    required: ["key_challenges", "ticket_volume_per_month"],
    description: "Scope & impact captured (challenges + ticket volume)"
  },
  [ESTABLISHED_TIMELINE_STAGE_ID]: {
    required: ["timeline_for_change"],
    description: "Timeline established"
  },
  [AGENT_COUNT_STAGE_ID]: {
    required: ["agents_required"],
    description: "Agent count confirmed"
  },
  [SUPPORT_CHANNELS_STAGE_ID]: {
    required: ["support_channels"],
    description: "Support channels confirmed"
  },
  [PRICING_DISCUSSED_STAGE_ID]: {
    required: [],
    description: "Pricing shared with prospect (email evidence required)"
  },
  [SELECTED_TIER_STAGE_ID]: {
    required: ["has_line_items"],
    description: "Tier selected (line items created)"
  },
  contractsent: {
    required: [],
    description: "Quote/invoice sent (invoice created + link sent)"
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
