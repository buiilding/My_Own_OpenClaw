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

function isAbortError(error) {
  return error && typeof error === 'object' && error.name === 'AbortError';
}

function printHelp() {
  console.log(`Usage:
  node examples/simple-chat-cli/run.mjs
  node examples/simple-chat-cli/run.mjs --once="hello"
  node examples/simple-chat-cli/run.mjs --once="hello" --debug-events

Environment:
  WINDIE_BACKEND_URL  Remote backend URL. Defaults to https://api.windieos.com
  WINDIE_INSTALL_TOKEN  Existing hosted backend install token. Optional.
  WINDIE_USER_ID      User id for the SDK session. Optional; hosted auth supplies one.

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
const userId = process.env.WINDIE_USER_ID || undefined;
const installToken = process.env.WINDIE_INSTALL_TOKEN || undefined;
const conversationRef = argValue('--conversation') || `cli-${Date.now()}`;
const once = argValue('--once');
const debugEvents = hasArg('--debug-events');

const client = new WindieClient({
  backendUrl,
  WebSocketImpl,
  defaultUserId: userId,
  installAuth: {
    installToken,
    autoRegister: !installToken,
  },
});

const agent = await client.wakeUp({
  userId,
  agentId: `simple-chat-cli-${Date.now()}`,
  name: 'Simple Chat CLI',
  systemPrompt: 'You are a helpful assistant. Be concise. This text-only CLI has no callable tools.',
});

if (debugEvents) {
  const originalQuery = agent.session.query.bind(agent.session);
  agent.session.query = async payload => {
    console.error('[debug] sending query', JSON.stringify(payload));
    return originalQuery(payload);
  };
  agent.session.on('message', event => {
    console.error('[debug] backend message', JSON.stringify(event));
  });
  agent.session.on('close', event => {
    console.error('[debug] websocket closed', JSON.stringify(event));
  });
  agent.session.on('socket-error', event => {
    console.error('[debug] websocket error', event);
  });
}

const chat = agent.chat({ conversationRef });

async function sendMessage(text) {
  process.stdout.write('\nassistant: waiting for response...\n');
  let startedOutput = false;
  const startAssistantOutput = () => {
    if (!startedOutput) {
      process.stdout.write('assistant: ');
      startedOutput = true;
    }
  };
  try {
    for await (const event of chat.stream(text)) {
      if (event.type === 'text') {
        startAssistantOutput();
        process.stdout.write(event.text);
      } else if (event.type === 'tool_call') {
        startAssistantOutput();
        process.stdout.write(`\n[tool: ${event.toolName}]\n`);
      } else if (event.type === 'tool_output') {
        startAssistantOutput();
        process.stdout.write('[tool output received]\n');
      } else if (event.type === 'complete') {
        startAssistantOutput();
        process.stdout.write('\n');
      } else if (event.type === 'error') {
        startAssistantOutput();
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
        let text;
        try {
          text = await rl.question('user: ');
        } catch (error) {
          if (isAbortError(error)) {
            process.stdout.write('\n');
            break;
          }
          throw error;
        }
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
