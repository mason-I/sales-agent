import type { query } from "@anthropic-ai/claude-agent-sdk";
import { extractStructuredOutput } from "./claude";

export async function collectStructuredOutput<T>(
  runner: ReturnType<typeof query>,
  timeoutMs: number,
  label: string
): Promise<T | null> {
  let structured: T | null = null;
  let sawStructured = false;
  const timeoutId = setTimeout(() => {
    console.warn(`[StructuredOutput] ${label} timed out after ${timeoutMs}ms, closing query.`);
    runner.close();
  }, timeoutMs);

  try {
    for await (const message of runner) {
      if (message?.type === "result" && message.subtype === "success" && message.structured_output) {
        structured = message.structured_output as T;
        sawStructured = true;
      } else if (message?.type === "result" && message.subtype !== "success") {
        const errors = Array.isArray(message.errors) ? message.errors.join("; ") : "unknown error";
        console.warn(`[StructuredOutput] Error (${message.subtype}): ${errors}`);
      } else if (message?.type === "result" && message.subtype === "success" && typeof message.result === "string") {
        const trimmed = message.result.trim();
        if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
          try {
            structured = JSON.parse(trimmed) as T;
            sawStructured = true;
          } catch {
            // ignore invalid JSON in result
          }
        }
      }
      const extracted = extractStructuredOutput(message);
      if (extracted !== null && extracted !== undefined) {
        structured = extracted as T;
        sawStructured = true;
      }

      if (sawStructured) {
        runner.close();
        break;
      }
    }
  } finally {
    clearTimeout(timeoutId);
  }

  return structured;
}
