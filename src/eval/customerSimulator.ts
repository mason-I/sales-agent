/**
 * Customer Simulator
 *
 * Uses Claude SDK to role-play as a customer persona during evaluation.
 * The LLM improvises within persona guidelines to create realistic,
 * varied conversations.
 */

import { query } from "@anthropic-ai/claude-agent-sdk";
import { getClaudeCodePath, getClaudeEnv, extractStructuredOutput } from "../runtime/claude";
import type { CustomerPersona, Turn, DisclosureStyle } from "./types";
import { CUSTOMER_RESPONSE_SCHEMA } from "./types";

type CustomerResponse = {
  message: string;
  shouldEnd: boolean;
  endReason?: string;
};

const DISCLOSURE_DESCRIPTIONS: Record<DisclosureStyle, string> = {
  minimal: "You share very little information. One-word or short answers. Make them work for every detail.",
  gradual: "You start guarded but slowly open up as trust builds. Reveal information piece by piece.",
  forthcoming: "You're open and direct. You share information readily when asked.",
  evasive: "You avoid direct answers. Deflect, change subjects, speak in hypotheticals.",
  conditional: "You only share information after your conditions are met (e.g., technical questions answered first).",
  decreasing: "You start engaged but become less responsive over time. Responses get shorter and slower."
};

const domainSeedByRunId = new Map<string, number>();

function getDomainSeed(runId: string): number {
  const existing = domainSeedByRunId.get(runId);
  if (existing !== undefined) return existing;
  const seed = Math.floor(100000 + Math.random() * 900000);
  domainSeedByRunId.set(runId, seed);
  return seed;
}

function buildCustomerSystemPrompt(persona: CustomerPersona, turnNumber: number): string {
  const disclosureDescription = DISCLOSURE_DESCRIPTIONS[persona.disclosureStyle];

  return `**YOU ARE ${persona.name.toUpperCase()}, ${persona.role} at ${persona.company}.**

Do not narrate. Do not explain your thinking. Do not say "Here's how I'd respond" or "As ${persona.name}".
Simply BE ${persona.name} and write your email response directly.

YOUR INTENT: ${persona.intent}

YOUR COMMUNICATION STYLE: ${persona.disclosureStyle}
${disclosureDescription}

BEHAVIORAL GUIDELINES:
${persona.behaviors.map(b => `- ${b}`).join("\n")}

INFORMATION YOU CAN REVEAL (only if asked appropriately and you choose to):
- Budget: ${persona.budget || "Do not disclose - you genuinely don't know yet"}
- Timeline: ${persona.timeline || "Be vague - no concrete timeline"}
- Team size: ${persona.teamSize || "Do not disclose"}

CURRENT TURN: ${turnNumber}

CRITICAL RULES:
1. Write ONLY as ${persona.name} - no narration, no meta-commentary
2. Respond naturally in first person ("I", "we", "our") 
3. Your response should be a realistic business email (1-4 sentences typically)
4. React authentically to what the sales agent says
5. If the agent is doing well (thoughtful questions, genuine understanding), gradually open up
6. If the agent is pushy or robotic, become more guarded

DECISION TO END (CRITICAL INSTRUCTIONS):

**DEFAULT: Set shouldEnd=false**. Sales conversations typically run for multiple exchanges.

Only set shouldEnd=true if ONE of these applies:
1. The agent sent a concrete next step (proposal, contract, invoice) AND you've decided to accept or decline it
2. You're explicitly not interested and ending the conversation
3. You're frustrated and done engaging

**YOU MUST SET shouldEnd=false IF:**
- The agent asked you questions (answer them and keep going!)
- You just provided information (that's normal back-and-forth!)
- The agent explained features (respond with your reaction!)
- You're still exploring or evaluating
- The conversation is progressing normally

**This is an ongoing conversation. One exchange is not the end. Keep the dialogue going until there's a real reason to stop.**`;
}

function buildCustomerPrompt(
  conversationHistory: Turn[],
  latestAgentResponse: string
): string {
  let prompt = "";

  if (conversationHistory.length > 0) {
    prompt += "CONVERSATION SO FAR:\n";
    for (const turn of conversationHistory) {
      const role = turn.role === "customer" ? "You" : "Sales Agent";
      prompt += `[${role}]: ${turn.message}\n\n`;
    }
    prompt += "---\n\n";
  }

  prompt += `LATEST MESSAGE FROM SALES AGENT:\n${latestAgentResponse}\n\n`;
  prompt += "Write your email reply. Do NOT narrate or explain - write ONLY the email content itself.\n\n";
  prompt += "REMEMBER: Set shouldEnd=false to continue the conversation (this is normal back-and-forth).";

  return prompt;
}

function buildInitialInquiryPrompt(persona: CustomerPersona): string {
  return `Write your initial inquiry email to this sales team.

Requirements:
1. Be appropriately vague based on your disclosure style (${persona.disclosureStyle})
2. Match your intent: "${persona.intent}"
3. Follow your behavioral guidelines
4. Keep it short and realistic (1-3 sentences)
5. Don't reveal too much upfront

Write ONLY the email content itself. No narration, no explanation, no meta-commentary.
Write as ${persona.name} would naturally write.

**CRITICAL**: Set shouldEnd=false since this is just the start of the conversation.`;
}

/**
 * Generate the initial customer inquiry (Turn 1)
 */
export async function generateInitialInquiry(
  persona: CustomerPersona
): Promise<CustomerResponse> {
  const systemPrompt = buildCustomerSystemPrompt(persona, 1);
  const userPrompt = buildInitialInquiryPrompt(persona);

  return await callCustomerLLM(systemPrompt, userPrompt);
}

/**
 * Generate a customer response to an agent message
 */
export async function generateCustomerResponse(
  persona: CustomerPersona,
  conversationHistory: Turn[],
  agentResponse: string
): Promise<CustomerResponse> {
  const turnNumber = Math.floor(conversationHistory.length / 2) + 1;
  const systemPrompt = buildCustomerSystemPrompt(persona, turnNumber);
  const userPrompt = buildCustomerPrompt(conversationHistory, agentResponse);

  return await callCustomerLLM(systemPrompt, userPrompt);
}

async function callCustomerLLM(
  systemPrompt: string,
  userPrompt: string
): Promise<CustomerResponse> {
  const claudePath = getClaudeCodePath();
  if (!claudePath) {
    throw new Error("Claude CLI not found. Set CLAUDE_CODE_PATH environment variable or ensure 'claude' is in PATH.");
  }

  const retryPrompt = `${userPrompt}\n\nIMPORTANT: Return ONLY valid JSON that matches the schema. No commentary, no markdown.`;
  const prompts = [userPrompt, retryPrompt];

  let structured: CustomerResponse | null = null;
  let lastError: string | null = null;
  const attemptFlows: string[] = [];

  for (let attempt = 0; attempt < prompts.length; attempt++) {
    const debugMessages: string[] = [];
    let attemptError: string | null = null;

    for await (const message of query({
      prompt: prompts[attempt],
      options: {
        model: "opus",
        executable: "bun",
        pathToClaudeCodeExecutable: claudePath,
        env: getClaudeEnv(),
        systemPrompt: { type: "preset", preset: "claude_code", append: systemPrompt } as any,
        outputFormat: { type: "json_schema", schema: CUSTOMER_RESPONSE_SCHEMA },
        settingSources: ["project", "user"] as any,
        allowedTools: ["StructuredOutput"],
        permissionMode: "bypassPermissions" as const
      }
    }) as AsyncIterable<any>) {
      debugMessages.push(`${message.type}${message.subtype ? `:${message.subtype}` : ""}`);

      if (message.type === "result") {
        if (message.subtype && message.subtype.startsWith("error")) {
          attemptError = JSON.stringify({
            subtype: message.subtype,
            errors: message.errors,
            result: message.result,
            code: message.code,
            message: message.message
          });
        }
        if (message.structured_output) {
          structured = message.structured_output as CustomerResponse;
        }
        if (!structured && message.result && typeof message.result === "string") {
          try {
            const parsed = JSON.parse(message.result);
            if (typeof parsed.message === "string") {
              structured = parsed as CustomerResponse;
            }
          } catch {
            // Not valid JSON
          }
        }
      }

      const extracted = extractStructuredOutput(message);
      if (extracted && typeof extracted.message === "string") {
        structured = extracted as CustomerResponse;
      }
    }

    attemptFlows.push(`attempt ${attempt + 1}: ${debugMessages.join(" -> ")}`);
    if (attemptError) {
      lastError = attemptError;
    }

    if (structured) {
      break;
    }
  }

  if (lastError && !structured) {
    throw new Error(`Customer LLM query failed: ${lastError}\nMessage flow: ${attemptFlows.join(" | ")}`);
  }

  if (!structured) {
    throw new Error(`Customer LLM returned no structured output. Message flow: ${attemptFlows.join(" | ")}`);
  }

  if (!structured.message || structured.message.trim().length === 0) {
    throw new Error("Customer LLM returned empty message.");
  }

  return {
    message: structured.message,
    shouldEnd: structured.shouldEnd ?? false,
    endReason: structured.endReason
  };
}

// =============================================================================
// Name and Company Generation (Dynamic)
// =============================================================================

const NAME_COMPANY_SCHEMA = {
  type: "object",
  properties: {
    name: { type: "string" },
    company: { type: "string" }
  },
  required: ["name", "company"],
  additionalProperties: false
} as const;

async function generateNameAndCompany(seed: number): Promise<{ name: string; company: string }> {
  const claudePath = getClaudeCodePath();
  if (!claudePath) {
    throw new Error("Claude CLI not found");
  }

  const prompt = `Generate a realistic name and company for a business professional. Use seed ${seed} to ensure some variation. Return a diverse, realistic name and a plausible B2B company name (with suffix like Inc, LLC, Corp, etc).`;

  let result: { name: string; company: string } | null = null;

  for await (const message of query({
    prompt,
    options: {
      model: "opus",
      executable: "bun",
      pathToClaudeCodeExecutable: claudePath,
      env: getClaudeEnv(),
      systemPrompt: { type: "preset", preset: "claude_code", append: "Generate realistic business names and companies. Be diverse and creative." } as any,
      outputFormat: { type: "json_schema", schema: NAME_COMPANY_SCHEMA },
      settingSources: ["project", "user"] as any,
      allowedTools: ["StructuredOutput"],
      permissionMode: "bypassPermissions" as const
    }
  }) as AsyncIterable<any>) {
    if (message.type === "result" && message.structured_output) {
      result = message.structured_output as { name: string; company: string };
    }
  }

  if (!result) {
    throw new Error("Failed to generate name and company");
  }

  return result;
}

/**
 * Generate a unique customer persona from a template
 */
export async function generatePersonaInstance(
  template: any,
  runId: string,
  index: number
): Promise<CustomerPersona> {
  // Use a combination of runId hash and index for unique but deterministic generation
  const runIdHash = runId.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const seed = runIdHash * 1000 + index;

  const { name, company } = await generateNameAndCompany(seed);

  const email = buildPersonaEmail(name, runId, index);

  return {
    id: template.id,
    name,
    company,
    role: template.role,
    email,
    intent: template.intent,
    disclosureStyle: template.disclosureStyle,
    budget: template.budget,
    timeline: template.timeline,
    teamSize: template.teamSize,
    behaviors: template.behaviors
  };
}

function buildPersonaEmail(name: string, runId: string, index: number): string {
  const raw = name.toLowerCase().trim();
  const localPart = raw
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "")
    .replace(/\.+/g, ".");

  const safeLocal = localPart.length > 0 ? localPart : "prospect";
  const safeRunId = runId.replace(/[^a-z0-9]+/gi, "");
  const suffix = `${safeRunId}-${index}`.replace(/[^a-z0-9-]+/gi, "").slice(-20);
  const combined = `${safeLocal}-${suffix}`.replace(/^\-+|\-+$/g, "");
  const domainSeed = getDomainSeed(runId);
  const domain = `eval-${domainSeed + index}.com`;

  // Hard enforce .com domain for HubSpot compatibility.
  return `${combined.slice(0, 48)}@${domain}`;
}

/**
 * Select a persona template based on weighted distribution
 */
export function selectPersonaTemplate(
  templates: any[],
  distribution: Array<{ templateId: string; weight: number }>,
  random: number // 0-1 random value
): any {
  const totalWeight = distribution.reduce((sum, d) => sum + d.weight, 0);
  let cumulative = 0;
  const target = random * totalWeight;

  for (const dist of distribution) {
    cumulative += dist.weight;
    if (target <= cumulative) {
      return templates.find(t => t.id === dist.templateId);
    }
  }

  // Fallback to first template
  return templates[0];
}
