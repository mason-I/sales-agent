import type { SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";

type PromptContent =
  | string
  | Array<{
      type: "text" | "image";
      text?: string;
      source?: {
        type: "base64";
        media_type: string;
        data: string;
      };
    }>;

export async function* buildStreamingPrompt(
  content: PromptContent,
  options: {
    sessionId?: string | null;
    parentToolUseId?: string | null;
  } = {}
): AsyncGenerator<SDKUserMessage> {
  yield {
    type: "user",
    session_id: options.sessionId ?? "",
    parent_tool_use_id: options.parentToolUseId ?? null,
    message: {
      role: "user",
      content
    }
  };
}
