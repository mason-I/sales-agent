import { query } from "@anthropic-ai/claude-agent-sdk";
import { DERIVED_STATE_SCHEMA, NEXT_ACTION_SCHEMA, DRAFT_EVIDENCE_SCHEMA } from "./schemas";
import { getClaudeCodePath, getClaudeEnv, extractStructuredOutput } from "./claude";
import { formatSummaryForPrompt } from "./summary";
import { STAGE_NAMES, STAGE_ORDER } from "../config/dealStage";
import { fetchDealProperties, hubspotRequest } from "../lib/hubspot";

const COMMITMENT_ORDER = [...STAGE_ORDER, "closedlost"];

function formatCommitmentOrder() {
  return COMMITMENT_ORDER.map((id, idx) => `${idx + 1}) ${STAGE_NAMES[id] || id} (${id})`).join("\n");
}

function normalizeSummary(summary: any) {
  if (!summary) return null;
  if (typeof summary === "string") {
    try {
      return JSON.parse(summary);
    } catch {
      return summary;
    }
  }
  return summary;
}

export type DerivedCommitmentState = {
  commitmentCurrent: string;
  commitmentEvidence: Array<{ commitment: string; evidence: string }>;
  pricingIntent: "explicit" | "implied" | "none";
  buyerIntent: "product_question" | "pricing_question" | "objection" | "implementation" | "stop_contact" | "unknown";
  fatigueSignals: { present: boolean; rationale: string };
  recentAsks: string[];
  unknowns: string[];
};

export type NextActionPolicy = {
  mustAnswer: string;
  nextCommitment: string;
  minimalAsk: string;
  askStyle: "question" | "cta" | "nurture" | "close";
  avoidTopics: string[];
  pricingDirective: { required: boolean; skus: string[]; notes: string | null };
};

export type CommitmentArtifacts = {
  lineItems: number;
  invoicePaid: boolean;
  invoiceId: string | null;
  invoiceStatus: string | null;
  invoiceLink: string | null;
};

export type DraftEvidence = {
  pricingIncluded: boolean;
  pricingEvidence: string | null;
  invoiceLinkIncluded: boolean;
  invoiceEvidence: string | null;
};

const INVOICE_PROPERTIES = ["hs_invoice_status", "hs_invoice_url", "hs_invoice_link", "hs_createdate"];

export async function fetchCommitmentArtifacts(dealId: string): Promise<CommitmentArtifacts> {
  const properties = await fetchDealProperties(dealId, ["hs_num_of_associated_line_items"]);
  const lineItems = Number(properties.hs_num_of_associated_line_items ?? 0) || 0;

  let invoicePaid = false;
  let latestInvoice: { id: string; status: string | null; link: string | null; createdAt: number } | null = null;

  try {
    const assoc = await hubspotRequest<any>("GET", `/crm/v4/objects/deals/${dealId}/associations/invoices?limit=100`);
    const invoiceIds = assoc.results?.map((r: any) => r.toObjectId) || [];

    for (const invoiceId of invoiceIds) {
      try {
        const invoice = await hubspotRequest<any>(
          "GET",
          `/crm/v3/objects/invoices/${invoiceId}?properties=${INVOICE_PROPERTIES.join(",")}`
        );
        const props = invoice?.properties || {};
        const status = String(props.hs_invoice_status || "").toLowerCase() || null;
        const link = props.hs_invoice_url || props.hs_invoice_link || null;
        const createdAt = Number(props.hs_createdate || 0) || 0;
        if (status === "invoice_paid") invoicePaid = true;
        if (!latestInvoice || createdAt > latestInvoice.createdAt) {
          latestInvoice = { id: String(invoiceId), status, link, createdAt };
        }
      } catch {
        // ignore individual invoice failures
      }
    }
  } catch {
    // ignore invoice lookup failures
  }

  return {
    lineItems,
    invoicePaid,
    invoiceId: latestInvoice?.id || null,
    invoiceStatus: latestInvoice?.status || null,
    invoiceLink: latestInvoice?.link || null
  };
}

export async function evaluateDraftEvidence({
  draft,
  invoiceLink
}: {
  draft: { subject: string; body: string };
  invoiceLink?: string | null;
}): Promise<DraftEvidence> {
  const pricingPattern = /\$[\d,]+(?:\.\d{1,2})?|\bUSD\b|\bper\s+agent\b/i.test(draft.body);
  const invoiceLinkPresent = invoiceLink ? draft.body.includes(invoiceLink) : false;

  const systemPrompt = `You evaluate whether an email draft includes explicit pricing and an invoice link.

Rules:
- pricingIncluded=true ONLY if the draft contains explicit numeric pricing (e.g., "$99", "USD 99", "per agent $49").
- invoiceLinkIncluded=true ONLY if the exact invoice link appears in the draft.
- Provide a short evidence snippet when true; otherwise null.`;

  const userPrompt = `Draft Subject: ${draft.subject}
Draft Body:
${draft.body}

Invoice Link (if any): ${invoiceLink || "(none)"}

Deterministic signals:
- pricingPatternFound: ${pricingPattern}
- invoiceLinkPresent: ${invoiceLinkPresent}`;

  let structured: DraftEvidence | null = null;

  for await (const message of query({
    prompt: userPrompt,
    options: {
      model: "opus",
      executable: "bun",
      pathToClaudeCodeExecutable: getClaudeCodePath(),
      env: getClaudeEnv(),
      systemPrompt: { type: "preset", preset: "claude_code", append: systemPrompt },
      settingSources: ["project", "user"],
      allowedTools: ["StructuredOutput"],
      outputFormat: { type: "json_schema", schema: DRAFT_EVIDENCE_SCHEMA },
      permissionMode: "bypassPermissions"
    }
  })) {
    const extracted = extractStructuredOutput(message);
    if (extracted !== null && extracted !== undefined) {
      structured = extracted as DraftEvidence;
    }
  }

  if (!structured) {
    return {
      pricingIncluded: pricingPattern,
      pricingEvidence: pricingPattern ? "Detected pricing pattern in draft." : null,
      invoiceLinkIncluded: invoiceLinkPresent,
      invoiceEvidence: invoiceLinkPresent ? "Detected invoice link in draft." : null
    };
  }

  return {
    pricingIncluded: Boolean(structured.pricingIncluded) && pricingPattern,
    pricingEvidence: structured.pricingEvidence ?? null,
    invoiceLinkIncluded: Boolean(structured.invoiceLinkIncluded) && invoiceLinkPresent,
    invoiceEvidence: structured.invoiceEvidence ?? null
  };
}

export async function deriveCommitmentState({
  dealId,
  dealSummary,
  dealStageId,
  dealStageName,
  artifacts,
  event
}: {
  dealId: string;
  dealSummary: any;
  dealStageId?: string | null;
  dealStageName?: string | null;
  artifacts?: { lineItems: number; invoiceStatus?: string | null; invoiceLink?: string | null };
  event?: { subject?: string | null; body?: string | null };
}) {
  const summaryText = formatSummaryForPrompt(normalizeSummary(dealSummary) || null);
  const systemPrompt = `You are a commitment-state classifier for a sales agent.

Rules:
- Output the current commitment stage using the IDs provided.
- Do NOT regress behind the current stage if provided.
- Only output closedlost if the prospect is clearly not interested or requests no further contact.
- Use explicit or implied pricing intent when appropriate.
- Extract recent asks from the summary's latest comms; avoid hallucinating if unknown.

Commitment order (monotonic):
${formatCommitmentOrder()}

Definitions:
- Pricing intent explicit: asks for price/cost/quote directly.
- Pricing intent implied: asks which plan/tier to choose, or “what would this cost for ~N.”
- Fatigue signals: frustration with questions, wanting to stop, or repeated asks ignored.`;

  const userPrompt = `Deal ID: ${dealId}
Current Stage: ${dealStageName || "Unknown"} (${dealStageId || "unknown"})

Event:
Subject: ${event?.subject || "(none)"}
Body:
${event?.body || "(none)"}

Artifacts:
${JSON.stringify(artifacts || {}, null, 2)}

Deal Summary:
${summaryText || "No deal summary."}`;

  let structured: DerivedCommitmentState | null = null;

  for await (const message of query({
    prompt: userPrompt,
    options: {
      model: "opus",
      executable: "bun",
      pathToClaudeCodeExecutable: getClaudeCodePath(),
      env: getClaudeEnv(),
      systemPrompt: { type: "preset", preset: "claude_code", append: systemPrompt },
      settingSources: ["project", "user"],
      allowedTools: ["StructuredOutput"],
      outputFormat: { type: "json_schema", schema: DERIVED_STATE_SCHEMA },
      permissionMode: "bypassPermissions"
    }
  })) {
    const extracted = extractStructuredOutput(message);
    if (extracted !== null && extracted !== undefined) {
      structured = extracted as DerivedCommitmentState;
    }
  }

  if (!structured) {
    throw new Error("Derived commitment state returned no structured output.");
  }

  return structured;
}

export async function deriveNextActionPolicy({
  dealId,
  derivedState,
  dealSummary,
  event
}: {
  dealId: string;
  derivedState: DerivedCommitmentState;
  dealSummary: any;
  event?: { subject?: string | null; body?: string | null };
}) {
  const summaryText = formatSummaryForPrompt(normalizeSummary(dealSummary) || null);

  const systemPrompt = `You are a next-action policy planner for a sales agent.

Rules:
- Answer the prospect's immediate intent first (mustAnswer).
- Provide ONE minimal steering move (minimalAsk) that advances the next commitment.
- Avoid repeating questions found in recentAsks.
- Use nurture mode if fatigueSignals present or buyer ignored previous asks.
- If buyer intent is stop_contact, set askStyle=close and minimalAsk should be a brief close (no question).
- If pricingIntent is explicit or implied, set pricingDirective.required=true and include any SKUs to quote if known.

Commitment order (monotonic):
${formatCommitmentOrder()}
`;

  const userPrompt = `Deal ID: ${dealId}

Derived State:
${JSON.stringify(derivedState, null, 2)}

Event:
Subject: ${event?.subject || "(none)"}
Body:
${event?.body || "(none)"}

Deal Summary:
${summaryText || "No deal summary."}`;

  let structured: NextActionPolicy | null = null;

  for await (const message of query({
    prompt: userPrompt,
    options: {
      model: "opus",
      executable: "bun",
      pathToClaudeCodeExecutable: getClaudeCodePath(),
      env: getClaudeEnv(),
      systemPrompt: { type: "preset", preset: "claude_code", append: systemPrompt },
      settingSources: ["project", "user"],
      allowedTools: ["StructuredOutput"],
      outputFormat: { type: "json_schema", schema: NEXT_ACTION_SCHEMA },
      permissionMode: "bypassPermissions"
    }
  })) {
    const extracted = extractStructuredOutput(message);
    if (extracted !== null && extracted !== undefined) {
      structured = extracted as NextActionPolicy;
    }
  }

  if (!structured) {
    throw new Error("Next action policy returned no structured output.");
  }

  return structured;
}
