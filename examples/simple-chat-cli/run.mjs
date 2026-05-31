#!/usr/bin/env node
import readline from "node:readline/promises";
import { exit, stderr, stdin, stdout } from "node:process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadLocalWindieSdk } from "../_shared/local_sdk_loader.mjs";

const exampleDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(exampleDir, "../..");
const backendUrl = process.env.WINDIE_BACKEND_URL ?? "https://api.windieos.com";

async function loadExampleSdk() {
  const { WindieClient } = await loadLocalWindieSdk(repoRoot);
  return { WindieClient };
}

const { WindieClient } = await loadExampleSdk();

const client = new WindieClient({
  backendUrl,
  installToken: process.env.WINDIE_API_KEY,
});

const agent = await client.wakeUp({
  systemPrompt: "Your name is Peter, you are Peter Bui virtual friend.",
  builtins: ["browser"],
});

const chat = agent.chat({
  conversationRef: "cli-chat",
});

const rl = readline.createInterface({
  input: stdin,
  output: stdout,
});

stdout.write("Windie CLI. Type /exit to quit.\n\n");

function isReadlineClosedError(error) {
  return (
    error && typeof error === "object" && error.code === "ERR_USE_AFTER_CLOSE"
  );
}

async function readPrompt() {
  try {
    return await rl.question("you> ");
  } catch (error) {
    if (isReadlineClosedError(error)) {
      return null;
    }
    throw error;
  }
}

function isLargeBinaryDisplayField(key, value) {
  return (
    typeof value === "string" &&
    value.length > 500 &&
    /screenshot|image|base64|bytes|data_url/i.test(key)
  );
}

function summarizeBinaryDisplayField(key, value, parent) {
  const contentType =
    typeof parent?.[`${key}_content_type`] === "string"
      ? parent[`${key}_content_type`]
      : typeof parent?.content_type === "string"
        ? parent.content_type
        : null;
  const kind = contentType ? ` ${contentType}` : "";
  return `[omitted${kind} ${key}, ${value.length} chars]`;
}

function sanitizeToolResultForTerminal(value, parent = null) {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeToolResultForTerminal(item, parent));
  }

  if (value && typeof value === "object") {
    const sanitized = {};
    for (const [key, nested] of Object.entries(value)) {
      if (isLargeBinaryDisplayField(key, nested)) {
        sanitized[key] = summarizeBinaryDisplayField(key, nested, value);
      } else {
        sanitized[key] = sanitizeToolResultForTerminal(nested, value);
      }
    }
    return sanitized;
  }

  return value;
}

try {
  for (;;) {
    const text = await readPrompt();

    if (text === null) break;
    if (!text.trim()) continue;
    if (text.trim() === "/exit") break;

    stdout.write("\n");
    let lastState = null;

    for await (const event of chat.stream(text)) {
      switch (event.type) {
        case "state":
          if (event.state !== lastState) {
            lastState = event.state;
            if (event.state !== "streaming") {
              stdout.write(`\n[state] ${event.state}\n`);
            }
          }
          break;

        case "reasoning_delta":
          stdout.write(`\x1b[2m[thinking] ${event.text}\x1b[0m`);
          break;

        case "assistant_delta":
          stdout.write(event.text);
          break;

        case "assistant_message":
          break;

        case "tool_calls":
          for (const call of event.calls) {
            stdout.write(`\n\n[tool call] ${call.toolName}\n`);
            stdout.write(JSON.stringify(call.args, null, 2));
            stdout.write("\n");
          }
          break;

        case "tool_outputs":
          for (const output of event.outputs) {
            stdout.write(`\n[tool output] ${output.toolName}\n`);
            stdout.write(
              JSON.stringify(
                {
                  success: output.success,
                  error: output.error,
                  result: sanitizeToolResultForTerminal(output.result),
                },
                null,
                2,
              ),
            );
            stdout.write("\n");
          }
          break;

        case "error":
          stderr.write(`\n[error] ${event.message}\n`);
          break;
      }
    }

    stdout.write("\n");
  }
} finally {
  rl.close();
  await agent.sleep?.();
}
exit(0);
