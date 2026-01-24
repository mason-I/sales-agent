export const INTENT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    typeofengagement: { type: "string", enum: ["call", "email"] },
    intent: {
      type: "string",
      enum: [
        "new",
        "reply",
        "spam",
        "non-sales",
        "not-interested",
        "out-of-office",
        "unknown"
      ]
    },
    goal: { type: "string" }
  },
  required: ["typeofengagement", "intent", "goal"]
} as const;

const JUDGE_ITEM = {
  type: "object",
  additionalProperties: false,
  properties: {
    code: { type: "string", minLength: 1, maxLength: 64 },
    message: { type: "string", minLength: 1, maxLength: 500 },
    order: { anyOf: [{ type: "integer", minimum: 1 }, { type: "null" }] }
  },
  required: ["code", "message", "order"]
};

export const PLAN_JUDGE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    pass: { type: "boolean" },
    score: { type: "integer", minimum: 0, maximum: 100 },
    recommendedIntent: {
      anyOf: [
        {
          type: "string",
          enum: [
            "new",
            "reply",
            "spam",
            "non-sales",
            "not-interested",
            "out-of-office",
            "unknown"
          ]
        },
        { type: "null" }
      ]
    },
    recommendedGoal: { anyOf: [{ type: "string", maxLength: 300 }, { type: "null" }] },
    violations: { type: "array", items: JUDGE_ITEM },
    suggestions: { type: "array", items: JUDGE_ITEM }
  },
  required: ["pass", "score", "recommendedIntent", "recommendedGoal", "violations", "suggestions"]
} as const;

export const DEAL_SUMMARY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    stage: { type: "string" },
    stageGaps: { type: "array", items: { type: "string" } },
    budget: {
      type: "object",
      additionalProperties: false,
      properties: {
        value: { anyOf: [{ type: "number" }, { type: "null" }] },
        currency: { type: "string" },
        confidence: { type: "string", enum: ["confirmed", "mentioned", "unknown"] }
      },
      required: ["value", "currency", "confidence"]
    },
    authority: {
      type: "object",
      additionalProperties: false,
      properties: {
        decisionMaker: { anyOf: [{ type: "string" }, { type: "null" }] },
        level: { type: "string", enum: ["decision_maker", "influencer", "committee", "unknown"] },
        needsApproval: { type: "array", items: { type: "string" } }
      },
      required: ["decisionMaker", "level", "needsApproval"]
    },
    need: {
      type: "object",
      additionalProperties: false,
      properties: {
        primaryPain: { anyOf: [{ type: "string" }, { type: "null" }] },
        challenges: { type: "array", items: { type: "string" } },
        desiredOutcomes: { type: "array", items: { type: "string" } }
      },
      required: ["primaryPain", "challenges", "desiredOutcomes"]
    },
    timeline: {
      type: "object",
      additionalProperties: false,
      properties: {
        deadline: { anyOf: [{ type: "string" }, { type: "null" }] },
        urgency: { type: "string", enum: ["high", "medium", "low"] }
      },
      required: ["deadline", "urgency"]
    },
    sizing: {
      type: "object",
      additionalProperties: false,
      properties: {
        agents_required: { anyOf: [{ type: "number" }, { type: "null" }] },
        support_channels: { type: "array", items: { type: "string" } },
        ticket_volume_per_month: { anyOf: [{ type: "number" }, { type: "null" }] }
      },
      required: ["agents_required", "support_channels", "ticket_volume_per_month"]
    },
    sentiment: { type: "string", enum: ["positive", "neutral", "hesitant", "cold"] },
    objections: {
      type: "object",
      additionalProperties: false,
      properties: {
        open: { type: "array", items: { type: "string" } },
        resolved: { type: "array", items: { type: "string" } }
      },
      required: ["open", "resolved"]
    },
    latestComms: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          timestamp: { type: "string" },
          direction: { type: "string" },
          type: { type: "string" },
          summary: { type: "string" }
        },
        required: ["timestamp", "direction", "type", "summary"]
      }
    },
    agreedNextStep: { anyOf: [{ type: "string" }, { type: "null" }] },
    openQuestions: { type: "array", items: { type: "string" } },
    narrative: { type: "string" }
  },
  required: [
    "stage",
    "stageGaps",
    "budget",
    "authority",
    "need",
    "timeline",
    "sizing",
    "sentiment",
    "objections",
    "latestComms",
    "agreedNextStep",
    "openQuestions",
    "narrative"
  ]
} as const;

export const DEAD_OPP_EVAL_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    reasonCategory: {
      type: "string",
      enum: [
        "timing",
        "budget",
        "competitor",
        "missing_feature",
        "no_fit",
        "no_need",
        "not_interested",
        "unknown"
      ]
    },
    reasonSummary: { type: "string", minLength: 1, maxLength: 500 },
    featureGap: {
      type: "object",
      additionalProperties: false,
      properties: {
        isFeatureGap: { type: "boolean" },
        feature: { anyOf: [{ type: "string" }, { type: "null" }] }
      },
      required: ["isFeatureGap", "feature"]
    },
    followUpDate: { anyOf: [{ type: "string" }, { type: "null" }] },
    followUpDateSource: { anyOf: [{ type: "string" }, { type: "null" }] },
    sentiment: { type: "string", enum: ["positive", "neutral", "hesitant", "cold"] },
    doNotContact: { type: "boolean" },
    hardBlocker: { type: "boolean" },
    hardBlockerReason: { anyOf: [{ type: "string" }, { type: "null" }] },
    kbCheck: {
      type: "object",
      additionalProperties: false,
      properties: {
        status: { anyOf: [{ type: "string", enum: ["FOUND", "NOT_FOUND", "SKIPPED", "ERROR"] }, { type: "null" }] },
        links: { type: "array", items: { type: "string" } },
        summary: { anyOf: [{ type: "string" }, { type: "null" }] }
      },
      required: ["status", "links", "summary"]
    }
  },
  required: [
    "reasonCategory",
    "reasonSummary",
    "featureGap",
    "followUpDate",
    "followUpDateSource",
    "sentiment",
    "doNotContact",
    "hardBlocker",
    "hardBlockerReason",
    "kbCheck"
  ]
} as const;

const COMMITMENT_ENUM = [
  "2130118129", // Expressed Commercial Intent
  "2182866374", // Admitted Pain / Gap
  "2185655765", // Defined Scope & Impact
  "2388431315", // Established Timeline
  "2390248940", // Confirmed Agent Count
  "2388431316", // Confirmed Support Channels
  "2388431317", // Pricing Discussed
  "2387718587", // Selected Tier
  "contractsent", // Quote Sent
  "closedwon", // Paid
  "closedlost" // Closed Lost
] as const;

export const DERIVED_STATE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    commitmentCurrent: { type: "string", enum: COMMITMENT_ENUM },
    commitmentEvidence: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          commitment: { type: "string", enum: COMMITMENT_ENUM },
          evidence: { type: "string", minLength: 1, maxLength: 500 }
        },
        required: ["commitment", "evidence"]
      }
    },
    pricingIntent: { type: "string", enum: ["explicit", "implied", "none"] },
    buyerIntent: {
      type: "string",
      enum: ["product_question", "pricing_question", "objection", "implementation", "stop_contact", "unknown"]
    },
    fatigueSignals: {
      type: "object",
      additionalProperties: false,
      properties: {
        present: { type: "boolean" },
        rationale: { type: "string", minLength: 1, maxLength: 500 }
      },
      required: ["present", "rationale"]
    },
    recentAsks: { type: "array", items: { type: "string" } },
    unknowns: { type: "array", items: { type: "string" } }
  },
  required: [
    "commitmentCurrent",
    "commitmentEvidence",
    "pricingIntent",
    "buyerIntent",
    "fatigueSignals",
    "recentAsks",
    "unknowns"
  ]
} as const;

export const NEXT_ACTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    mustAnswer: { type: "string", minLength: 1, maxLength: 600 },
    nextCommitment: { type: "string", enum: COMMITMENT_ENUM },
    minimalAsk: { type: "string", minLength: 1, maxLength: 300 },
    askStyle: { type: "string", enum: ["question", "cta", "nurture", "close"] },
    avoidTopics: { type: "array", items: { type: "string" } },
    pricingDirective: {
      type: "object",
      additionalProperties: false,
      properties: {
        required: { type: "boolean" },
        skus: { type: "array", items: { type: "string" } },
        notes: { anyOf: [{ type: "string", maxLength: 300 }, { type: "null" }] }
      },
      required: ["required", "skus", "notes"]
    }
  },
  required: ["mustAnswer", "nextCommitment", "minimalAsk", "askStyle", "avoidTopics", "pricingDirective"]
} as const;

export const DRAFT_EVIDENCE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    pricingIncluded: { type: "boolean" },
    pricingEvidence: { anyOf: [{ type: "string", maxLength: 200 }, { type: "null" }] },
    invoiceLinkIncluded: { type: "boolean" },
    invoiceEvidence: { anyOf: [{ type: "string", maxLength: 200 }, { type: "null" }] }
  },
  required: ["pricingIncluded", "pricingEvidence", "invoiceLinkIncluded", "invoiceEvidence"]
} as const;

export const RUN_NOTE_INSIGHTS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    whatWorked: { type: "array", items: { type: "string" } },
    whatDidnt: { type: "array", items: { type: "string" } },
    missingContext: { type: "array", items: { type: "string" } },
    harnessSuggestions: { type: "array", items: { type: "string" } }
  },
  required: ["whatWorked", "whatDidnt", "missingContext", "harnessSuggestions"]
} as const;
