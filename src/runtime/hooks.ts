import type { 
  HookCallback, 
  PreToolUseHookInput, 
  PostToolUseHookInput,
  PostToolUseFailureHookInput,
  NotificationHookInput,
  UserPromptSubmitHookInput
} from "@anthropic-ai/claude-agent-sdk";

const MCP_PREFIX = "mcp__sales-crm__";
const QUOTE_TOOLS = new Set([
  `${MCP_PREFIX}crm_createLineItemsForDeal`,
  `${MCP_PREFIX}crm_createDraftInvoice`
]);

// =============================================================================
// Enforcement State
// =============================================================================

/**
 * Tracks enforcement requirements for the current agent run.
 * Used by hooks to ensure the agent completes required actions.
 */
export type EnforcementState = {
  emailLogged: boolean;
  stopRetryCount: number;
  eventSource: string;
  pricingIntent?: "explicit" | "implied" | "none";
  pricingCatalogRead?: boolean;
  buyerIntent?: "product_question" | "pricing_question" | "objection" | "implementation" | "stop_contact" | "unknown";
  askStyle?: "question" | "cta" | "nurture" | "close";
  recentAsks?: string[];
  fatigueSignals?: { present: boolean; rationale?: string };
  lastInvoiceLink?: string | null;
  lastInvoiceId?: string | null;
};

type DraftInput = {
  subject: string;
  bodyParts: {
    intro: string;
    questions: string[];
    closing: string;
  };
};

/**
 * Create a new enforcement state for an agent run.
 */
export function createEnforcementState(eventSource: string): EnforcementState {
  return {
    emailLogged: false,
    stopRetryCount: 0,
    eventSource,
    pricingIntent: "none",
    pricingCatalogRead: false,
    buyerIntent: "unknown",
    askStyle: "nurture",
    recentAsks: [],
    fatigueSignals: { present: false, rationale: "unknown" },
    lastInvoiceLink: null,
    lastInvoiceId: null
  };
}

const MAX_STOP_RETRIES = 2;

/**
 * Auto-correction patterns for common tool input issues.
 * These hooks GUIDE rather than BLOCK - they fix issues and let the agent continue.
 */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function detectAsyncOnlyViolation(text: string): boolean {
  if (!text) return false;
  const lower = text.toLowerCase();
  const patterns = [
    /\b(book|schedule|set up|arrange)\b.*\b(call|meeting|demo)\b/,
    /\b(calendar|calendly|invite|meeting link|timeslot|time slots)\b/,
    /\bzoom\b/,
    /\bgoogle meet\b/
  ];
  return patterns.some(p => p.test(lower));
}

function sanitizeDraftContent(input: any): { sanitized: any; changed: boolean; issues: string[] } {
  const issues: string[] = [];
  const sanitized = { ...input };
  
  if (input.bodyParts) {
    const parts = { ...input.bodyParts };
    
    // Check and sanitize intro
    if (parts.intro && detectAsyncOnlyViolation(parts.intro)) {
      issues.push("Intro contained meeting/call language");
    }
    
    // Check and sanitize questions
    if (Array.isArray(parts.questions)) {
      const cleanedQuestions = parts.questions.filter((q: string) => {
        if (detectAsyncOnlyViolation(q)) {
          issues.push("Question contained meeting/call language");
          return false;
        }
        return true;
      });

      // Allow 0-3 questions; do not enforce a minimum
      parts.questions = cleanedQuestions.slice(0, 3);
    }
    
    // Check and sanitize closing
    if (parts.closing && detectAsyncOnlyViolation(parts.closing)) {
      issues.push("Closing contained meeting/call language");
    }
    
    sanitized.bodyParts = parts;
  }
  
  // Check subject
  if (input.subject && detectAsyncOnlyViolation(input.subject)) {
    issues.push("Subject contained meeting/call language");
  }
  
  return {
    sanitized,
    changed: issues.length > 0,
    issues
  };
}

function buildDraftBody(bodyParts: { intro: string; questions: string[]; closing: string }): string {
  const intro = String(bodyParts.intro || "").trim();
  const closing = String(bodyParts.closing || "").trim();
  const questions = Array.isArray(bodyParts.questions)
    ? bodyParts.questions.map((q) => String(q).trim()).filter(Boolean)
    : [];

  const normalizedQuestions = questions.slice(0, 3).map((q) => (q.endsWith("?") ? q : `${q}?`));
  const questionLines = normalizedQuestions.map((q, i) => `${i + 1}) ${q}`).join("\n");

  let body = [intro, questionLines, closing].filter(Boolean).join("\n\n");
  if (!/zendesk/i.test(body)) {
    body = `${body}\n\nZendesk`;
  }

  return body;
}

function normalizeDraftInput(input: any): DraftInput | null {
  if (!input || typeof input !== "object") return null;
  const subject = String(input.subject || "").trim();
  const bodyParts = input.bodyParts as any;
  if (!subject || !bodyParts) return null;

  const intro = String(bodyParts.intro || "").trim();
  const closing = String(bodyParts.closing || "").trim();
  const questions = Array.isArray(bodyParts.questions)
    ? bodyParts.questions.map((q: string) => String(q).trim()).filter(Boolean)
    : [];

  return {
    subject,
    bodyParts: { intro, questions, closing }
  };
}

function normalizeQuestion(text: string): string {
  return text
    .toLowerCase()
    .replace(/so i can help you[^,]*,\s*/i, "")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isRepeatQuestion(question: string, recentAsks: string[]): boolean {
  if (!question || !recentAsks.length) return false;
  const normalized = normalizeQuestion(question);
  return recentAsks.some((ask) => {
    const normalizedAsk = normalizeQuestion(ask);
    return normalizedAsk && (normalized.includes(normalizedAsk) || normalizedAsk.includes(normalized));
  });
}

function hasCta(bodyParts: { intro: string; questions: string[]; closing: string }): boolean {
  const combined = `${bodyParts.intro} ${bodyParts.closing}`.toLowerCase();
  const patterns = [
    /\bplease\b/,
    /\blet me know\b/,
    /\breply\b/,
    /\bshare\b/,
    /\bconfirm\b/,
    /\bsend\b/,
    /\bclarify\b/
  ];
  return patterns.some((p) => p.test(combined));
}

function draftIncludesPricing(bodyParts: { intro: string; questions: string[]; closing: string }): boolean {
  const combined = `${bodyParts.intro} ${bodyParts.questions.join(" ")} ${bodyParts.closing}`;
  const pattern = /\$[\d,]+(?:\.\d{1,2})?|\bUSD\b|\bper\s+agent\b/i;
  return pattern.test(combined);
}

function ensureValidKbObjective(input: any, fallback = "Verify Zendesk capability"): { updated: any; changed: boolean } {
  if (!input.objective || typeof input.objective !== "string" || input.objective.trim().length < 5) {
    return {
      updated: { ...input, objective: fallback },
      changed: true
    };
  }
  return { updated: input, changed: false };
}

const CATALOG_RESOURCE_URIS = new Set([
  "zendesk://products/catalog",
  "zendesk://pricing/catalog"
]);

// Local file paths that should count as catalog reads
const CATALOG_FILE_PATHS = new Set([
  "data/zendesk-products.json",
  "/data/zendesk-products.json"
]);

/**
 * Pre-tool hook for logging and auto-correction.
 * Blocks quoting/invoicing tools when pricing intent exists but catalog is not read.
 */
export function createPreToolHook(options: {
  onToolCall?: (toolName: string, input: any) => void;
  onToolDecision?: (toolName: string, decision: "allow" | "deny", reason?: string) => void;
  onDraftInput?: (input: DraftInput) => void;
  enforcementState?: EnforcementState;
}): HookCallback {
  return async (input, toolUseId, context) => {
    const pre = input as PreToolUseHookInput;
    const toolName = pre.tool_name;
    const rawToolInput = pre.tool_input;
    const toolInput = isRecord(rawToolInput) ? rawToolInput : {};
    
    // Log tool call for observability
    options.onToolCall?.(toolName, rawToolInput);
    
    // Auto-correct draft input (but don't block)
    if (toolName === `${MCP_PREFIX}crm_logEmailDraft`) {
      const pricingIntent = options.enforcementState?.pricingIntent || "none";
      const catalogRead = options.enforcementState?.pricingCatalogRead;
      const askStyle = options.enforcementState?.askStyle || "nurture";
      const buyerIntent = options.enforcementState?.buyerIntent || "unknown";
      const recentAsks = options.enforcementState?.recentAsks || [];

      const { sanitized, changed, issues } = sanitizeDraftContent(toolInput);
      let baseInput = changed ? sanitized : toolInput;
      let draftInput = normalizeDraftInput(baseInput);
      if (draftInput) {
        const originalQuestions = Array.isArray(draftInput.bodyParts.questions) ? draftInput.bodyParts.questions : [];
        const filteredQuestions = originalQuestions.filter((q) => !isRepeatQuestion(q, recentAsks));
        const removedRepeats = filteredQuestions.length !== originalQuestions.length;
        const questionCapApplied = filteredQuestions.length > 3;
        const updatedQuestions = filteredQuestions.slice(0, 3);
        const updatedBodyParts = { ...draftInput.bodyParts, questions: updatedQuestions };
        if (removedRepeats || questionCapApplied) {
          issues.push("Removed repeated questions or capped question count");
          baseInput = { ...baseInput, bodyParts: updatedBodyParts };
          draftInput = normalizeDraftInput(baseInput);
        }
        options.onDraftInput?.(draftInput);
      }
      
      if (buyerIntent === "stop_contact" && draftInput?.bodyParts?.questions?.length) {
        return {
          systemMessage: "Close-out reply must not include questions when buyer asked to stop contact.",
          hookSpecificOutput: {
            hookEventName: pre.hook_event_name,
            permissionDecision: "deny",
            permissionDecisionReason: "Stop-contact response must not include questions."
          }
        };
      }

      if (askStyle === "question") {
        const questionCount = draftInput?.bodyParts?.questions?.length || 0;
        if (questionCount === 0) {
          return {
            systemMessage: "Draft requires a minimal question to advance the next commitment.",
            hookSpecificOutput: {
              hookEventName: pre.hook_event_name,
              permissionDecision: "deny",
              permissionDecisionReason: "Missing required minimal ask (question)."
            }
          };
        }
      }

      const fatiguePresent = Boolean(options.enforcementState?.fatigueSignals?.present);
      const enforceCta =
        (askStyle === "cta") ||
        (askStyle === "nurture" && !fatiguePresent && buyerIntent !== "stop_contact");

      if (enforceCta && draftInput) {
        if (!draftInput.bodyParts.questions.length && !hasCta(draftInput.bodyParts)) {
          return {
            systemMessage: "Draft requires a minimal CTA to advance the next commitment.",
            hookSpecificOutput: {
              hookEventName: pre.hook_event_name,
              permissionDecision: "deny",
              permissionDecisionReason: "Missing required minimal CTA."
            }
          };
        }
      }

      if (pricingIntent !== "none" && !catalogRead && draftInput && draftIncludesPricing(draftInput.bodyParts)) {
        return {
          systemMessage: "QUOTE BLOCKED: Pricing intent detected but catalog not read. Use the Read tool on data/zendesk-products.json (or mcp__read_resource zendesk://products/catalog) before quoting.",
          hookSpecificOutput: {
            hookEventName: pre.hook_event_name,
            permissionDecision: "deny",
            permissionDecisionReason: "Pricing intent detected but catalog resource not read."
          }
        };
      }

      if (changed || issues.length > 0) {
        return {
          systemMessage: `Auto-correction applied to draft: ${issues.join("; ")}. Remember: this is an async-only agent - no meetings, calls, or demos.`,
          hookSpecificOutput: {
            hookEventName: pre.hook_event_name,
            permissionDecision: "allow",
            updatedInput: baseInput
          }
        };
      }
    }
    
    // Auto-correct KB search input
    if (toolName === `${MCP_PREFIX}kb_searchZendesk`) {
      const { updated, changed } = ensureValidKbObjective(toolInput);
      
      if (changed) {
        return {
          hookSpecificOutput: {
            hookEventName: pre.hook_event_name,
            permissionDecision: "allow",
            updatedInput: updated
          }
        };
      }
    }

    if (QUOTE_TOOLS.has(toolName)) {
      const pricingIntent = options.enforcementState?.pricingIntent || "none";
      const catalogRead = options.enforcementState?.pricingCatalogRead;
      if (pricingIntent !== "none" && !catalogRead) {
        options.onToolDecision?.(toolName, "deny", "Pricing intent detected but catalog resource not read.");
        return {
          systemMessage: "QUOTE BLOCKED: Pricing intent detected but catalog not read. Read the local catalog at data/zendesk-products.json (Read tool) before quoting.",
          hookSpecificOutput: {
            hookEventName: pre.hook_event_name,
            permissionDecision: "deny",
            permissionDecisionReason: "Pricing intent detected but catalog resource not read."
          }
        };
      }
      if (pricingIntent === "none") {
        options.onToolDecision?.(toolName, "allow", "Pricing intent not detected.");
        return {
          systemMessage: "Pricing intent not detected. Only quote if the prospect explicitly or implicitly requested pricing.",
          hookSpecificOutput: {
            hookEventName: pre.hook_event_name,
            permissionDecision: "allow",
            updatedInput: toolInput
          }
        };
      }
    }
    
    // Auto-correct line items - remove any price overrides (no discounts allowed)
    if (toolName === `${MCP_PREFIX}crm_createLineItemsForDeal`) {
      const inputWithItems = toolInput as { items?: any[] };
      const items = inputWithItems.items;
      if (items && Array.isArray(items)) {
        const hasOverrides = items.some(item => item.price !== undefined);
        if (hasOverrides) {
          const correctedItems = items.map(({ sku, quantity }) => ({ sku, quantity }));
          return {
            systemMessage: "Price overrides are not allowed. Using catalog pricing only. No discounts.",
            hookSpecificOutput: {
              hookEventName: pre.hook_event_name,
              permissionDecision: "allow",
              updatedInput: { ...toolInput, items: correctedItems }
            }
          };
        }
      }
    }
    
    // Allow all other tools
    return {};
  };
}

/**
 * Post-tool hook for logging, context injection, and enforcement tracking.
 * Adds helpful context based on tool results and tracks required actions.
 */
export function createPostToolHook(options: {
  onToolResult?: (toolName: string, result: any, success: boolean, toolInput: any, toolUseId: string) => void;
  enforcementState?: EnforcementState;
  getDraftInput?: () => DraftInput | null;
  setDraftInput?: (input: DraftInput | null) => void;
  onEmailDraft?: (draft: { subject: string; body: string; emailId?: string | null }) => void;
  onContractSent?: (payload: { invoiceId: string; invoiceLink: string }) => void;
}): HookCallback {
  return async (input, toolUseId, context) => {
    const post = input as PostToolUseHookInput;
    const toolName = post.tool_name;
    const response = post.tool_response;
    
    // Parse result
    let parsed: any = null;
    try {
      if (typeof response === "string") {
        parsed = JSON.parse(response);
      } else if (response && typeof response === "object" && "content" in response) {
        const content = (response as any).content;
        if (Array.isArray(content) && content[0]?.text) {
          parsed = JSON.parse(content[0].text);
        } else {
          parsed = response;
        }
      } else {
        parsed = response;
      }
    } catch {
      parsed = response;
    }
    
    const isSuccess = parsed?.ok !== false && parsed?.success !== false;
    options.onToolResult?.(toolName, parsed, isSuccess, post.tool_input, post.tool_use_id);
    
    // Track email logging for enforcement
    if (toolName === `${MCP_PREFIX}crm_logEmailDraft` && isSuccess) {
      if (options.enforcementState) {
        options.enforcementState.emailLogged = true;
      }

      const draftInput = options.getDraftInput?.() || null;
      if (draftInput) {
        const body = buildDraftBody(draftInput.bodyParts);
        const emailId = parsed?.data?.emailId ?? parsed?.data?.id ?? null;
        options.onEmailDraft?.({
          subject: draftInput.subject,
          body,
          emailId: emailId ? String(emailId) : null
        });
        options.setDraftInput?.(null);
        const invoiceLink = options.enforcementState?.lastInvoiceLink || null;
        const invoiceId = options.enforcementState?.lastInvoiceId || null;
        if (invoiceLink && invoiceId && body.includes(String(invoiceLink))) {
          options.onContractSent?.({ invoiceId: String(invoiceId), invoiceLink: String(invoiceLink) });
        }
      }
    }

    if (toolName === "mcp__read_resource" && isSuccess && options.enforcementState) {
      const inputRecord = isRecord(post.tool_input) ? post.tool_input : {};
      const inputServer = typeof inputRecord.server === "string" ? inputRecord.server : null;
      const inputUri = typeof inputRecord.uri === "string" ? inputRecord.uri : null;
      const server = typeof parsed?.server === "string" ? parsed.server : parsed?.data?.server || inputServer;
      const uri =
        typeof parsed?.uri === "string"
          ? parsed.uri
          : parsed?.contents?.[0]?.uri || parsed?.data?.contents?.[0]?.uri || inputUri;
      if (server === "sales-crm") {
        const resolvedUri = typeof uri === "string" ? uri : "";
        if (CATALOG_RESOURCE_URIS.has(resolvedUri)) {
          options.enforcementState.pricingCatalogRead = true;
        }
      }
    }

    if (toolName === "Read" && isSuccess && options.enforcementState) {
      const inputRecord = isRecord(post.tool_input) ? post.tool_input : {};
      const filePath = typeof inputRecord.file_path === "string" ? inputRecord.file_path : "";
      if (filePath.endsWith("/data/zendesk-products.json") || filePath.endsWith("/data/pricing.json")) {
        options.enforcementState.pricingCatalogRead = true;
      }
    }

    if (toolName === "Bash" && isSuccess && options.enforcementState) {
      const inputRecord = isRecord(post.tool_input) ? post.tool_input : {};
      const command = typeof inputRecord.command === "string" ? inputRecord.command : "";
      if (command.includes("data/zendesk-products.json") || command.includes("data/pricing.json")) {
        options.enforcementState.pricingCatalogRead = true;
      }
    }

    if (toolName === `${MCP_PREFIX}crm_createDraftInvoice` && isSuccess && options.enforcementState) {
      const invoiceLink = parsed?.data?.invoiceLink;
      const invoiceId = parsed?.data?.invoiceId;
      if (invoiceLink) options.enforcementState.lastInvoiceLink = String(invoiceLink);
      if (invoiceId) options.enforcementState.lastInvoiceId = String(invoiceId);

      if (invoiceLink) {
        return {
          hookSpecificOutput: {
            hookEventName: post.hook_event_name,
            additionalContext: `Invoice created. Include this invoice URL in your reply: ${String(invoiceLink)}`
          }
        };
      }
    }
    
    // Add helpful context for KB NOT_FOUND
    if (toolName === `${MCP_PREFIX}kb_searchZendesk`) {
      const status = parsed?.data?.status;
      if (status === "NOT_FOUND") {
        return {
          hookSpecificOutput: {
            hookEventName: post.hook_event_name,
            additionalContext: "KB search returned NOT_FOUND. Try rephrasing your objective with different keywords, or ask a clarifying question to narrow the scope. Do not guess at Zendesk capabilities."
          }
        };
      }
    }
    
    // Add context for tool failures
    if (!isSuccess && parsed?.error) {
      return {
        hookSpecificOutput: {
          hookEventName: post.hook_event_name,
          additionalContext: `Tool ${toolName} failed: ${parsed.error}. Try an alternative approach or continue without this result if non-critical.`
        }
      };
    }
    
    return {};
  };
}

/**
 * Logging-only stop hook for telemetry (used when no enforcement is needed).
 */
export function createStopHook(options: {
  onStop?: (reason: string) => void;
}): HookCallback {
  return async (input, toolUseId, context) => {
    options.onStop?.("Agent stopped");
    return {};
  };
}

/**
 * Enforcing stop hook that blocks completion without required email response.
 * For new_inbound and reply_to_existing events, the agent MUST log an email draft.
 * No exceptions (escalations removed - agent is fully autonomous).
 * 
 * If email not logged, the hook blocks the stop and forces the agent to continue.
 */
export function createEnforcingStopHook(options: {
  onStop?: (reason: string) => void;
  enforcementState: EnforcementState;
}): HookCallback {
  return async (input, toolUseId, context) => {
    const state = options.enforcementState;
    
    // Sources that require an email response
    const requiresEmail = ["new_inbound", "reply_to_existing"].includes(state.eventSource);
    
    if (requiresEmail && !state.emailLogged) {
      state.stopRetryCount++;
      
      if (state.stopRetryCount > MAX_STOP_RETRIES) {
        // Prevent infinite loops - allow completion but log warning
        options.onStop?.("Agent stopped without email (max retries reached)");
        console.warn("[Hooks] Agent failed to log email after max retries");
        return {};
      }
      
      // Force agent to continue and send the email
      console.log(`[Hooks] Stop blocked - email required but not logged (attempt ${state.stopRetryCount}/${MAX_STOP_RETRIES})`);
      return {
        continue: true,
        systemMessage: `STOP BLOCKED: You must respond to the customer before completing. Use the draft-reply skill and call crm_logEmailDraft to send your response. This is attempt ${state.stopRetryCount} of ${MAX_STOP_RETRIES}.`
      };
    }
    
    options.onStop?.("Agent stopped");
    return {};
  };
}

/**
 * PostToolUseFailure hook for self-healing.
 * Injects recovery guidance when tools fail.
 */
export function createPostToolUseFailureHook(): HookCallback {
  return async (input, toolUseId, context) => {
    const failInput = input as PostToolUseFailureHookInput;
    const { tool_name, error, is_interrupt } = failInput;
    
    // Don't inject guidance for intentional interrupts
    if (is_interrupt) return {};
    
    // Inject recovery guidance
    return {
      systemMessage: `Tool "${tool_name}" failed with error: ${error}. ` +
        `Try an alternative approach, or continue without this result if non-critical. ` +
        `Do not repeatedly retry the same failing operation.`
    };
  };
}

/**
 * Build all hooks for the sales agent.
 * When enforcementState is provided, uses enforcing stop hook that requires email response.
 * Includes self-healing hooks for resilience.
 */
export function buildSalesAgentHooks(callbacks: {
  onToolCall?: (toolName: string, input: any) => void;
  onToolResult?: (toolName: string, result: any, success: boolean, toolInput: any, toolUseId: string) => void;
  onToolFailure?: (toolName: string, error: string, toolInput: any, toolUseId: string, isInterrupt?: boolean) => void;
  onToolDecision?: (toolName: string, decision: "allow" | "deny", reason?: string) => void;
  onStop?: (reason: string) => void;
  onNotification?: (message: string, title?: string) => void;
  onEmailDraft?: (draft: { subject: string; body: string; emailId?: string | null }) => void;
  onContractSent?: (payload: { invoiceId: string; invoiceLink: string }) => void;
  enforcementState?: EnforcementState;
  additionalContext?: string | null;
} = {}) {
  // Choose stop hook based on whether enforcement is enabled
  const stopHook = callbacks.enforcementState
    ? createEnforcingStopHook({ 
        onStop: callbacks.onStop, 
        enforcementState: callbacks.enforcementState 
      })
    : createStopHook(callbacks);
  
  let lastDraftInput: DraftInput | null = null;

  return {
    PreToolUse: [
      { matcher: ".*", hooks: [createPreToolHook({
        onToolCall: callbacks.onToolCall,
        onToolDecision: callbacks.onToolDecision,
        onDraftInput: (input) => {
          lastDraftInput = input;
        },
        enforcementState: callbacks.enforcementState
      })] }
    ],
    PostToolUse: [
      { matcher: ".*", hooks: [createPostToolHook({
        onToolResult: callbacks.onToolResult,
        enforcementState: callbacks.enforcementState,
        getDraftInput: () => lastDraftInput,
        setDraftInput: (input) => {
          lastDraftInput = input;
        },
        onEmailDraft: callbacks.onEmailDraft,
        onContractSent: callbacks.onContractSent
      })] }
    ],
    UserPromptSubmit: callbacks.additionalContext
      ? [{ hooks: [async (input: UserPromptSubmitHookInput) => ({ hookSpecificOutput: { hookEventName: "UserPromptSubmit", additionalContext: callbacks.additionalContext || "" } })] }]
      : [],
    Notification: callbacks.onNotification
      ? [{
        hooks: [async (input: NotificationHookInput) => {
          callbacks.onNotification?.(input.message, input.title);
          return {};
        }]
      }]
      : [],
    PreCompact: callbacks.additionalContext
      ? [{ hooks: [async (input) => ({ hookSpecificOutput: { hookEventName: "PreCompact", additionalContext: callbacks.additionalContext || "" } })] }]
      : [],
    PostToolUseFailure: [
      { hooks: [async (input, toolUseId) => {
        const failInput = input as PostToolUseFailureHookInput;
        callbacks.onToolFailure?.(
          failInput.tool_name,
          failInput.error,
          failInput.tool_input,
          toolUseId ?? "",
          failInput.is_interrupt
        );
        return {};
      }] },
      { hooks: [createPostToolUseFailureHook()] }
    ],
    Stop: [
      { hooks: [stopHook] }
    ]
  };
}
