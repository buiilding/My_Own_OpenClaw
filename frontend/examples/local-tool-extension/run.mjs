#!/usr/bin/env node
/**
 * Runs the run workflow for the example application workspace.
 */

import http from 'node:http';
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
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, service: 'agent-local-tool-extension-example' }));
  });
  const sockets = new Set();
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', socket => {
    sockets.add(socket);
    socket.on('close', () => {
      sockets.delete(socket);
    });

    let toolName = 'save_local_note';
    let conversationRef = 'local-tool-extension-example';
    let turnRef = null;

    socket.on('message', raw => {
      const message = JSON.parse(raw.toString());
      if (message.type === 'handshake') {
        const tools = message.agent_definition?.tools?.client_manifest?.tools;
        const localTool = Array.isArray(tools)
          ? tools.find(tool => tool?.name === 'save_local_note')
          : null;
        toolName = localTool?.name || toolName;
        send(socket, 'tool-schemas', { tool_schemas: tools || [] });
        return;
      }

      if (message.type === 'query') {
        conversationRef = message.payload?.conversation_ref || conversationRef;
        turnRef = message.payload?.turn_ref || turnRef;
        send(
          socket,
          'streaming-response',
          { text: 'Mock backend is asking the SDK local runtime to save a note.\n' },
          { conversation_ref: conversationRef, turn_ref: turnRef },
        );
        send(
          socket,
          'tool-call',
          {
            tool_name: toolName,
            tool_call_id: 'local-tool-extension-provider-call',
            parameters: {
              text: 'Local module tools execute through the SDK local runtime.',
              filename: 'agent-local-tool-extension.txt',
            },
            request_id: 'local-tool-extension-tool-call',
          },
          { conversation_ref: conversationRef, turn_ref: turnRef },
        );
        return;
      }

      if (message.type === 'tool-result') {
        const content = message.payload?.data?.output || 'No local tool content returned.';
        const requestId = message.payload?.request_id;
        send(
          socket,
          'tool-output',
          {
            tool_name: toolName,
            request_id: requestId,
            tool_call_id: 'local-tool-extension-provider-call',
            success: message.payload?.success !== false,
            output: content,
          },
          { conversation_ref: conversationRef, turn_ref: turnRef },
        );
        send(
          socket,
          'streaming-complete',
          {
            final_response: [
              'Local tool extension example completed.',
              '',
              content,
            ].join('\n'),
          },
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

const {
  AgentClient,
  moduleTool,
} = await loadLocalAgentSdk(repoRoot);

const backend = await createMockBackend();
const client = new AgentClient({
  backendUrl: backend.backendUrl,
  WebSocketImpl,
  autoLocalRuntime: {
    pythonCommand: path.join(repoRoot, 'scripts/python-in-env'),
    pythonArgs: ['sidecar', 'python'],
    startTimeoutMs: 15000,
  },
});

let agent = null;
try {
  agent = await client.wakeUp({
    agentId: 'local-tool-extension-example',
    name: 'Local Tool Extension Example',
    systemPrompt: 'You are a concise local-tool demo agent.',
    workspacePath: path.join(exampleDir, 'python'),
    tools: [
      moduleTool({
        name: 'save_local_note',
        description: 'Save a local note to a file and return the saved path.',
        module: 'save_note:save_local_note',
        schema: {
          type: 'object',
          properties: {
            text: { type: 'string', description: 'Note text to save.' },
            filename: { type: 'string', description: 'Output filename.' },
          },
          required: ['text'],
          additionalProperties: false,
        },
      }),
    ],
  });

  for await (const event of agent.stream('Save a local note through the SDK local runtime.', {
    conversationRef: 'local-tool-extension-example',
  })) {
    if (event.type === 'start') {
      console.log(`Started query ${event.queryMessageId}`);
    } else if (event.type === 'text') {
      process.stdout.write(event.text);
    } else if (event.type === 'tool_call') {
      console.log(`Calling local tool: ${event.toolName}`);
    } else if (event.type === 'tool_output') {
      console.log('Local tool output received.');
    } else if (event.type === 'complete') {
      console.log('\nFinal response:\n');
      console.log(event.finalResponse);
    } else if (event.type === 'error') {
      throw new Error(event.message);
    }
  }
  await agent.stop('local-tool-extension-example');
} finally {
  await agent?.shutdown?.();
  await backend.close();
}
