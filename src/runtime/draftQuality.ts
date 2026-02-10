import { query } from "@anthropic-ai/claude-agent-sdk";
import { DRAFT_QUALITY_SCHEMA } from "./schemas";
import { getClaudeCodePath, getClaudeEnv } from "./claude";
import { collectStructuredOutput } from "./structuredOutput";

const STRUCTURED_QUERY_TIMEOUT_MS = 45000;

export type DraftQualityResult = {
  requires_change: boolean;
  policy_violations: string[];
  has_cta: boolean;
  has_question: boolean;
  mentions_timeline_question: boolean;
  has_async_violation: boolean;
  has_placeholder: boolean;
  rationale: string | null;
};

export async function evaluateDraftQuality({
  subject,
  body,
  questions,
  context
}: {
  subject: string;
  body: string;
  questions: string[];
  context?: { requiresTimeline?: boolean; enforceCta?: boolean };
}): Promise<DraftQualityResult | null> {
  const systemPrompt = `You evaluate draft compliance for an async-only sales agent.

Rules:
- has_async_violation=true if the draft proposes calls/meetings/demos/scheduling or calendar links.
- has_placeholder=true if the draft contains placeholders like TODO, INSERT, or template tokens.
- has_cta=true if there is a clear call-to-action (e.g., "please reply", "let me know", "share", "confirm").
- has_question=true if the draft contains a direct question.
- mentions_timeline_question=true if a question explicitly asks for timeline/timeframe/when/by what date.
- requires_change=true if there is any async violation or placeholder, OR if the draft lacks required CTA/question for the provided context.
- policy_violations should list brief, specific violations (strings).
- Return JSON only matching the schema.`;

  const trimmedSubject = subject.slice(0, 200);
  const trimmedBody = body.length > 2000 ? `${body.slice(0, 2000)}…` : body;
  const trimmedQuestions = questions.map((q) => q.slice(0, 200)).slice(0, 3);

  const userPrompt = `Draft Subject:
${trimmedSubject}

Draft Body:
${trimmedBody}

Questions:
${JSON.stringify(trimmedQuestions, null, 2)}

Context:
${JSON.stringify({ requiresTimeline: context?.requiresTimeline ?? false, enforceCta: context?.enforceCta ?? false }, null, 2)}`;

  const structured = await collectStructuredOutput<DraftQualityResult>(
    query({
      prompt: userPrompt,
      options: {
        model: "opus",
        maxThinkingTokens: 128,
        executable: "bun",
        pathToClaudeCodeExecutable: getClaudeCodePath(),
        env: getClaudeEnv(),
        systemPrompt: { type: "preset", preset: "claude_code", append: systemPrompt },
        settingSources: ["user", "project"],
        allowedTools: ["StructuredOutput"],
        outputFormat: { type: "json_schema", schema: DRAFT_QUALITY_SCHEMA },
        allowDangerouslySkipPermissions: true,
        permissionMode: "bypassPermissions"
      }
    }),
    STRUCTURED_QUERY_TIMEOUT_MS,
    "evaluateDraftQuality"
  );

  return structured;
}
