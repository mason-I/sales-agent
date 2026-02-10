import { query } from "@anthropic-ai/claude-agent-sdk";
import { getClaudeCodePath, getClaudeEnv, extractStructuredOutput } from "./claude";
import { buildStreamingPrompt } from "./promptStream";
import { INBOUND_SIGNAL_SCHEMA } from "./schemas";

export type InboundSignalResult = {
  agents_required?: number | null;
  ticket_volume_per_month?: number | null;
  support_channels?: string[] | null;
  primary_pain?: string | null;
  key_challenges?: string[] | null;
  timeline_date_utc?: string | null;
  timeline_urgency: "high" | "medium" | "low" | "unknown";
  timeline_rationale?: string | null;
  fatigue_present: boolean;
  fatigue_rationale?: string | null;
  pricing_intent: "explicit" | "implied" | "none";
  no_response_needed: boolean;
  no_response_reason?: string | null;
};

export async function extractInboundSignalsSemantic(
  body: string,
  logVerbose: (message: string) => void,
  timeoutMs = 120000
): Promise<InboundSignalResult | null> {
  const today = new Date();
  const todayIso = today.toISOString().slice(0, 10);
  const prompt = `You are an information extractor for a sales agent. Extract semantic signals from the customer's message.

TODAY (UTC): ${todayIso}

Return JSON that follows the provided schema exactly. Rules:
- Use only the customer's message. Do not invent or infer beyond what is stated.
- Output REQUIRED keys only; omit optional fields when unknown.
- Do not output placeholder text like "none".
- For agents_required and ticket_volume_per_month: use a number only when explicitly stated; otherwise output null. Do not output 0 unless the customer explicitly said zero.
- Set timeline_urgency to "unknown" when no timeline is provided.
- Set fatigue_present=false when no fatigue is present or unknown.
- No-response decision: set no_response_needed=true ONLY if the customer reply is purely an acknowledgement (e.g., thanks/ok/best) with no new questions, requests, or information.
- If the customer asks to stop contact, set no_response_needed=false (we must send a confirmation email).

Output JSON must match this shape (omit unknown optional fields):
{
  "no_response_needed": false,
  "timeline_urgency": "unknown",
  "fatigue_present": false,
  "pricing_intent": "none",
  "agents_required": null,
  "ticket_volume_per_month": null
}

CUSTOMER MESSAGE:
${body}`;

  const structured = await attemptStructuredExtraction(prompt, logVerbose, timeoutMs);
  if (structured) {
    const coerced = coerceInboundSignals(structured);
    if (coerced) return coerced;
  }

  logVerbose("[Agent] Semantic extraction did not complete successfully.");
  return null;
}

async function attemptStructuredExtraction(
  prompt: string,
  logVerbose: (message: string) => void,
  timeoutMs: number
): Promise<InboundSignalResult | null> {
  let structured: InboundSignalResult | null = null;
  let timedOut = false;
  let hadError = false;
  const runner = query({
    prompt: buildStreamingPrompt(prompt),
    options: {
      model: "opus",
      executable: "bun",
      pathToClaudeCodeExecutable: getClaudeCodePath(),
      env: { ...getClaudeEnv(), CLAUDE_CODE_ENABLE_TASKS: "true" },
      systemPrompt: { type: "text", text: "Return structured JSON only." },
      settingSources: ["user", "project"],
      allowedTools: ["StructuredOutput"],
      outputFormat: { type: "json_schema", schema: INBOUND_SIGNAL_SCHEMA },
      allowDangerouslySkipPermissions: true,
      permissionMode: "bypassPermissions",
      stderr: (data: string) => {
        const lines = String(data).split(/\r?\n/).filter(Boolean);
        for (const line of lines) {
          logVerbose(`[Agent][semantic][stderr] ${line}`);
        }
      },
      maxThinkingTokens: 256
    }
  });
  const timeoutId = setTimeout(() => {
    timedOut = true;
    logVerbose(`[Agent] Semantic extraction timed out after ${timeoutMs}ms`);
    runner.close();
  }, timeoutMs);

  try {
    logVerbose("[Agent] Semantic extraction start");
    for await (const message of runner) {
      if (message.type === "result" && typeof message.subtype === "string" && message.subtype.startsWith("error")) {
        hadError = true;
        logVerbose(`[Agent][semantic] Result error: ${message.subtype} ${JSON.stringify(message.errors || message.message || message.result || {})}`);
      }
      if (message.type === "result" && message.subtype === "success" && message.structured_output) {
        structured = message.structured_output as InboundSignalResult;
      }
      const extracted = extractStructuredOutput(message);
      if (extracted) {
        structured = extracted as InboundSignalResult;
      }
    }
  } catch (error: any) {
    hadError = true;
    logVerbose(`[Agent] Semantic extraction failed: ${error?.message || error}`);
  } finally {
    clearTimeout(timeoutId);
  }

  if (timedOut || hadError) {
    return null;
  }

  return structured;
}

function coerceInboundSignals(raw: any): InboundSignalResult | null {
  if (!raw || typeof raw !== "object") return null;
  const asNumber = (value: any) => {
    if (value === null) return null;
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
    return null;
  };
  const asString = (value: any) => {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  };
  const asStringArray = (value: any) => {
    if (Array.isArray(value)) {
      return value
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter((item) => item.length > 0);
    }
    if (typeof value === "string") {
      return value
        .split(/[,;]+/)
        .map((item) => item.trim())
        .filter((item) => item.length > 0);
    }
    if (value === null || value === undefined) return null;
    return [];
  };
  const asBoolean = (value: any) => {
    if (typeof value === "boolean") return value;
    if (typeof value === "string") {
      const lowered = value.trim().toLowerCase();
      if (lowered === "true") return true;
      if (lowered === "false") return false;
    }
    return false;
  };

  return {
    agents_required: asNumber(raw.agents_required),
    ticket_volume_per_month: asNumber(raw.ticket_volume_per_month),
    support_channels: asStringArray(raw.support_channels),
    primary_pain: asString(raw.primary_pain),
    key_challenges: asStringArray(raw.key_challenges),
    timeline_date_utc: asString(raw.timeline_date_utc),
    timeline_urgency: ["high", "medium", "low", "unknown"].includes(raw.timeline_urgency)
      ? raw.timeline_urgency
      : "unknown",
    timeline_rationale: asString(raw.timeline_rationale),
    fatigue_present: typeof raw.fatigue_present === "boolean" ? raw.fatigue_present : false,
    fatigue_rationale: asString(raw.fatigue_rationale),
    pricing_intent: ["explicit", "implied", "none"].includes(raw.pricing_intent)
      ? raw.pricing_intent
      : "none",
    no_response_needed: asBoolean(raw.no_response_needed),
    no_response_reason: asString(raw.no_response_reason)
  };
}
