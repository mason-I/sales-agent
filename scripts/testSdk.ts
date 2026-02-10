import { query } from "@anthropic-ai/claude-agent-sdk";
import { loadEnv } from "../src/lib/env.js";
import { getClaudeCodePath, getClaudeEnv } from "../src/runtime/claude.js";
import { buildStreamingPrompt } from "../src/runtime/promptStream.js";

loadEnv();

async function test() {
    console.log("Checking environment...");
    console.log("ANTHROPIC_API_KEY exists:", !!process.env.ANTHROPIC_API_KEY);
    console.log("ANTHROPIC_BASE_URL:", process.env.ANTHROPIC_BASE_URL);

    const options = {
        model: "opus",
        executable: "bun",
        pathToClaudeCodeExecutable: getClaudeCodePath(),
        env: getClaudeEnv(),
        systemPrompt: { type: "preset", preset: "claude_code", append: "You are a test agent." },
        settingSources: ["user", "project"] as any,
    };

    try {
        console.log("Starting SDK query...");
        for await (const message of query({
            prompt: buildStreamingPrompt("Say 'SDK_TEST_OK'"),
            options: options as any
        })) {
            console.log("Message:", JSON.stringify(message, null, 2));
        }
        console.log("SDK query finished.");
    } catch (err: any) {
        console.error("SDK Error:", err.message);
    }
}

test();
