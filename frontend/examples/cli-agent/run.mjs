#!/usr/bin/env node
/**
 * Runs the run workflow for the example application workspace.
 */

import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  loadLocalAgentSdk,
  loadSdkWebSocket,
} from '../_shared/local_sdk_loader.mjs';

const exampleDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(exampleDir, '../..');
const { WebSocketServer, WebSocketImpl } = loadSdkWebSocket(repoRoot);

function send(socket, type, payload = {}, extra = {}) {
  socket.send(JSON.stringify({ type, payload, ...extra }));
}

function createMockBackend() {
  const modelConfig = {
    model_mode: 'online',
    model_provider: 'hosted-provider',
    selected_model_id: 'hosted-model',
    interaction_mode: 'agent',
  };
  const modelUpdates = [];
  const server = http.createServer((req, res) => {
    const url = new URL(req.url || '/', 'http://127.0.0.1');
    if (url.pathname === '/api/sdk/models') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        config: modelConfig,
        models: [
          {
            id: 'hosted-model',
            provider: 'hosted-provider',
            label: 'Hosted Model',
            model_mode: 'online',
            supports_tools: true,
          },
          {
            id: 'other-hosted-model',
            provider: 'other-hosted-provider',
            label: 'Other Hosted Model',
            model_mode: 'online',
            supports_tools: true,
          },
        ],
      }));
      return;
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, service: 'agent-cli-example' }));
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
      if (message.type === 'update-settings') {
        modelUpdates.push(message.payload);
        return;
      }
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
        modelUpdates,
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

const {
  AgentClient,
  FileConversationStore,
} = await loadLocalAgentSdk(repoRoot);

const backend = await createMockBackend();
const store = new FileConversationStore({
  directory: path.join(os.tmpdir(), 'agent-cli-example-store'),
});
const client = new AgentClient({
  backendUrl: backend.backendUrl,
  WebSocketImpl,
});
const initialModel = {
  modelProvider: 'hosted-provider',
  modelId: 'hosted-model',
  modelMode: 'online',
  interactionMode: 'agent',
};
const nextModel = {
  modelProvider: 'other-hosted-provider',
  modelId: 'other-hosted-model',
  modelMode: 'online',
  interactionMode: 'agent',
};

let agent = null;
try {
  const catalog = await client.listModels({ userId: 'cli-example-user' });
  console.log(`Loaded ${catalog.models.length} backend-owned models.`);

  agent = await client.wakeUp({
    agentId: 'cli-agent-example',
    name: 'CLI Agent Example',
    systemPrompt: 'You are a concise CLI demo agent.',
    model: initialModel,
    builtins: [],
    memory: false,
    persistence: false,
  });
  await agent.setModel(nextModel);

  const conversation = agent.conversation({
    conversationRef: 'cli-agent-example',
    store,
  });

  for await (const event of conversation.stream({
    text: 'Explain what runtime surface this example is using.',
    turnRef: 'cli-example-turn',
    model: initialModel,
  })) {
    if (event.type === 'conversation_event' && event.event.type === 'assistant_delta') {
      process.stdout.write(String(event.event.payload.text ?? ''));
    }
  }
  await conversation.retryTurn({
    turnRef: 'cli-example-retry-turn',
    model: nextModel,
  });
  await conversation.stop('cli-example-retry-turn');

  const [metadata] = await store.listMetadata();
  console.log('\nConversation metadata:');
  console.log(JSON.stringify(metadata, null, 2));
  console.log(`Model updates sent through SDK settings: ${backend.modelUpdates.length}`);
} finally {
  await agent?.shutdown?.();
  await backend.close();
}
