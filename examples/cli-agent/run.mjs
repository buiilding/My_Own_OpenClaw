#!/usr/bin/env node
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const wsModule = require('../../frontend/node_modules/ws');
const WebSocketServer = wsModule.WebSocketServer || wsModule.Server;
const WebSocketImpl = wsModule.WebSocket || wsModule;

const exampleDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(exampleDir, '../..');

function buildLocalSdk() {
  const sdkDir = path.join(repoRoot, 'packages/windie-sdk-js');
  const tsc = path.join(repoRoot, 'frontend/node_modules/.bin/tsc');
  const result = spawnSync(tsc, ['-p', 'tsconfig.build.json'], {
    cwd: sdkDir,
    stdio: 'inherit',
  });
  if (result.status !== 0) {
    throw new Error('Could not build the local Windie SDK. Run `cd frontend && npm install`, then retry.');
  }
}

function send(socket, type, payload = {}, extra = {}) {
  socket.send(JSON.stringify({ type, payload, ...extra }));
}

function createMockBackend() {
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, service: 'windie-cli-agent-example' }));
  });
  const sockets = new Set();
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', socket => {
    sockets.add(socket);
    socket.on('close', () => {
      sockets.delete(socket);
    });
    socket.on('message', raw => {
      const message = JSON.parse(raw.toString());
      if (message.type === 'query') {
        const conversationRef = message.payload?.conversation_ref || 'cli-agent-example';
        const turnRef = message.payload?.turn_ref || null;
        send(
          socket,
          'streaming-response',
          { text: `CLI runtime received: ${message.payload?.text || ''}\n` },
          { conversation_ref: conversationRef, turn_ref: turnRef },
        );
        send(
          socket,
          'streaming-response',
          { text: 'This response came through normalized SDK conversation events.\n' },
          { conversation_ref: conversationRef, turn_ref: turnRef },
        );
        send(
          socket,
          'streaming-complete',
          { final_response: 'CLI example complete.' },
          { conversation_ref: conversationRef, turn_ref: turnRef },
        );
      }
    });
  });

  return new Promise(resolve => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolve({
        backendUrl: `http://127.0.0.1:${address.port}`,
        close: () => new Promise(done => {
          for (const socket of sockets) {
            socket.terminate();
          }
          wss.close(() => server.close(done));
        }),
      });
    });
  });
}

buildLocalSdk();
const sdkPath = path.join(repoRoot, 'packages/windie-sdk-js/dist/index.js');
const {
  InMemoryConversationStore,
  WindieClient,
} = await import(pathToFileURL(sdkPath).href);

const backend = await createMockBackend();
const store = new InMemoryConversationStore();
const client = new WindieClient({
  backendUrl: backend.backendUrl,
  WebSocketImpl,
});

let agent = null;
try {
  agent = await client.wakeUp({
    agentId: 'cli-agent-example',
    name: 'CLI Agent Example',
    systemPrompt: 'You are a concise CLI demo agent.',
  });
  const conversation = agent.conversation({
    conversationRef: 'cli-agent-example',
    store,
  });

  for await (const event of conversation.stream({
    text: 'Explain what runtime surface this example is using.',
    turnRef: 'cli-example-turn',
  })) {
    if (event.type === 'conversation_event' && event.event.type === 'assistant_delta') {
      process.stdout.write(String(event.event.payload.text ?? ''));
    }
  }

  const [metadata] = await store.listMetadata();
  console.log('\nConversation metadata:');
  console.log(JSON.stringify(metadata, null, 2));
} finally {
  agent?.sleep();
  await backend.close();
}
