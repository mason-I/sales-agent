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

export async function* buildStreamingPrompt(content: PromptContent) {
  yield {
    type: "user" as const,
    message: {
      role: "user" as const,
      content
    }
  };
}
