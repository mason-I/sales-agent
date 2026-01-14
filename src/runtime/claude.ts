import { accessSync, constants, existsSync } from "fs";
import { delimiter, join } from "path";

function isExecutable(path: string) {
  try {
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function findClaudeInPath() {
  const pathEnv = process.env.PATH;
  if (!pathEnv) return undefined;
  const entries = pathEnv.split(delimiter);
  for (const entry of entries) {
    const candidate = join(entry, "claude");
    if (existsSync(candidate) && isExecutable(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

export function getClaudeCodePath() {
  const explicit = process.env.CLAUDE_CODE_PATH || process.env.CLAUDE_PATH;
  if (explicit && existsSync(explicit)) {
    return explicit;
  }

  return findClaudeInPath();
}

export function getClaudeEnv() {
  const env: Record<string, string> = { ...process.env } as Record<string, string>;
  const useLogin = env.CLAUDE_USE_LOGIN === "true" || env.CLAUDE_USE_LOGIN === "1";

  if (useLogin) {
    delete env.ANTHROPIC_API_KEY;
    delete env.ANTHROPIC_AUTH_TOKEN;
    delete env.ANTHROPIC_BASE_URL;
  }

  return env;
}

export function extractStructuredOutput(message: any) {
  if (!message) return null;

  if (message.type === "assistant" && message.message?.content) {
    for (const block of message.message.content) {
      if (block?.type === "tool_use" && block.name === "StructuredOutput") {
        return block.input ?? null;
      }
    }
  }

  return null;
}
