#!/usr/bin/env node
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  loadLocalWindieSdk,
  loadSdkWebSocket,
} from '../_shared/local_sdk_loader.mjs';

const exampleDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(exampleDir, '../..');

function argValue(name) {
  const prefix = `${name}=`;
  const match = process.argv.slice(2).find(arg => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : null;
}

function hasArg(name) {
  return process.argv.includes(name);
}

function printHelp() {
  console.log(`Usage:
  node examples/simple-chat-cli/run.mjs
  node examples/simple-chat-cli/run.mjs --once="hello"

Environment:
  WINDIE_BACKEND_URL  Remote backend URL. Defaults to https://api.windieos.com
  WINDIE_USER_ID      User id for the SDK session. Defaults to cli-user

Commands:
  /exit               Quit interactive chat
  /stop               Send a stop request for the active conversation
`);
}

if (hasArg('--help') || hasArg('-h')) {
  printHelp();
  process.exit(0);
}

const { WebSocketImpl } = loadSdkWebSocket(repoRoot);
const { WindieClient } = await loadLocalWindieSdk(repoRoot);

const backendUrl = process.env.WINDIE_BACKEND_URL || 'https://api.windieos.com';
const userId = process.env.WINDIE_USER_ID || 'cli-user';
const conversationRef = argValue('--conversation') || `cli-${Date.now()}`;
const once = argValue('--once');

const client = new WindieClient({
  backendUrl,
  WebSocketImpl,
  defaultUserId: userId,
});

const agent = await client.wakeUp({
  userId,
  agentId: `simple-chat-cli-${Date.now()}`,
  name: 'Simple Chat CLI',
  systemPrompt: 'You are a helpful assistant. Be concise.',
});

const chat = agent.chat({ conversationRef });

async function sendMessage(text) {
  process.stdout.write('\nassistant: ');
  try {
    for await (const event of chat.stream(text)) {
      if (event.type === 'text') {
        process.stdout.write(event.text);
      } else if (event.type === 'tool_call') {
        process.stdout.write(`\n[tool: ${event.toolName}]\n`);
      } else if (event.type === 'tool_output') {
        process.stdout.write('[tool output received]\n');
      } else if (event.type === 'complete') {
        process.stdout.write('\n');
      } else if (event.type === 'error') {
        process.stdout.write(`\n[error: ${event.error}]\n`);
      }
    }
  } catch (error) {
    process.stdout.write(`\n[request failed: ${error instanceof Error ? error.message : String(error)}]\n`);
  }
}

try {
  console.log(`Connected to ${backendUrl}`);
  console.log(`Conversation: ${conversationRef}`);

  if (once !== null) {
    await sendMessage(once);
  } else {
    console.log('Type /exit to quit.\n');
    const rl = readline.createInterface({ input, output });
    try {
      while (true) {
        const text = await rl.question('user: ');
        const trimmed = text.trim();
        if (!trimmed) {
          continue;
        }
        if (trimmed === '/exit') {
          break;
        }
        if (trimmed === '/stop') {
          await chat.stop();
          console.log('[stop requested]');
          continue;
        }
        await sendMessage(text);
      }
    } finally {
      rl.close();
    }
  }
} finally {
  chat.close();
  agent.sleep();
}
