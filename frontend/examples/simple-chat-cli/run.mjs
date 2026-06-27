#!/usr/bin/env node
/**
 * Runs the run workflow for the example application workspace.
 */

import readline from "node:readline/promises";
import { exit, stderr, stdin, stdout } from "node:process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadLocalAgentSdk } from "../_shared/local_sdk_loader.mjs";

const exampleDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(exampleDir, "../..");

const { AgentClient } = await loadLocalAgentSdk(repoRoot);
const installToken = process.env.AGENT_INSTALL_TOKEN;

if (!installToken) {
  throw new Error("Set AGENT_INSTALL_TOKEN before running this example.");
}

const agent = await new AgentClient().wakeUp({
  installAuth: {
    userId: "peter",
    installToken,
  },
  systemPrompt: undefined, // Use the hosted backend default system prompt.
  builtins: ["computer"],
});

const chat = agent.chat();

const rl = readline.createInterface({
  input: stdin,
  output: stdout,
});

let shutdownStarted = false;

async function shutdownAgent() {
  if (shutdownStarted) return;
  shutdownStarted = true;
  rl.close();
  await agent.shutdown?.();
}

function shutdown(code) {
  void shutdownAgent().finally(() => exit(code));
}

rl.on("SIGINT", () => shutdown(130));
process.once("SIGINT", () => shutdown(130));
process.once("SIGTERM", () => shutdown(143));

stdout.write("Agent CLI. Type /exit to quit.\n\n");

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

function printJson(value) {
  stdout.write(JSON.stringify(value, null, 2));
  stdout.write("\n");
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

        case "user_message":
          if (event.content) {
            stdout.write("\n[injected user message]\n");
            stdout.write(event.content);
            stdout.write("\n");
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
            printJson(call.args);
          }
          break;

        case "tool_outputs":
          for (const output of event.outputs) {
            stdout.write(`\n[tool output] ${output.toolName}\n`);
            printJson({
              success: output.success,
              error: output.error,
              result: output.result,
            });
          }
          break;

        case "memory_diagnostic":
          stdout.write(`\n[memory] ${event.stage}: ${event.message}`);
          if (event.error) {
            stdout.write(` (${event.error})`);
          }
          stdout.write("\n");
          break;

        case "error":
          stderr.write(`\n[error] ${event.message}\n`);
          break;
      }
    }

    stdout.write("\n");
  }
} finally {
  await shutdownAgent();
}
exit(0);
