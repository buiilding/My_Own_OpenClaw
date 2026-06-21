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
const { AgentClient } = await loadLocalAgentSdk(repoRoot);

function send(socket, type, payload = {}, extra = {}) {
  socket.send(JSON.stringify({ type, payload, ...extra }));
}

function createMockBackend() {
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, service: 'agent-repo-example' }));
  });
  const wss = new WebSocketServer({ server, path: '/ws' });
  const sockets = new Set();

  wss.on('connection', socket => {
    sockets.add(socket);
    socket.on('close', () => {
      sockets.delete(socket);
    });
    let toolName = 'read_repo_snapshot';
    let conversationRef = 'repo-agent-example';

    socket.on('message', raw => {
      const message = JSON.parse(raw.toString());
      if (message.type === 'handshake') {
        const tools = message.agent_definition?.tools?.client_manifest?.tools;
        const repoTool = Array.isArray(tools)
          ? tools.find(tool => tool?.name === 'read_repo_snapshot')
          : null;
        toolName = repoTool?.name || (Array.isArray(tools) && tools[0]?.name ? tools[0].name : toolName);
        send(socket, 'tool-schemas', { tool_schemas: tools || [] });
        return;
      }

      if (message.type === 'query') {
        conversationRef = message.payload?.conversation_ref || conversationRef;
        send(
          socket,
          'streaming-response',
          { text: 'Mock backend received the task and is calling the extension tool.\n' },
          { conversation_ref: conversationRef },
        );
        send(
          socket,
          'tool-call',
          {
            tool_name: toolName,
            tool_call_id: 'repo-agent-provider-call',
            parameters: {
              root: repoRoot,
              max_files: 12,
            },
            request_id: 'repo-agent-example-tool-call',
          },
          { conversation_ref: conversationRef },
        );
        return;
      }

      if (message.type === 'tool-result') {
        const content = message.payload?.data?.output || 'No tool content returned.';
        const requestId = message.payload?.request_id;
        send(
          socket,
          'tool-output',
          {
            tool_name: toolName,
            request_id: requestId,
            tool_call_id: 'repo-agent-provider-call',
            success: message.payload?.success !== false,
            output: content,
          },
          { conversation_ref: conversationRef },
        );
        send(
          socket,
          'streaming-response',
          { text: 'Extension tool returned a repo snapshot.\n' },
          { conversation_ref: conversationRef },
        );
        send(
          socket,
          'streaming-complete',
          {
            final_response: [
              'Repo agent example completed.',
              '',
              content,
            ].join('\n'),
          },
          { conversation_ref: conversationRef },
        );
      }
    });
  });

  return {
    listen: () => new Promise(resolve => {
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
    }),
  };
}

const backend = await createMockBackend().listen();
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
    agentId: 'repo-agent-example',
    name: 'Repo Agent Example',
    systemPrompt: 'You are a concise repository inspection agent.',
    workspacePath: repoRoot,
    plugins: [{ path: exampleDir }],
  });

  for await (const event of agent.stream('Inspect this repository.', {
    conversationRef: 'repo-agent-example',
  })) {
    if (event.type === 'start') {
      console.log(`Started query ${event.queryMessageId}`);
    } else if (event.type === 'text') {
      process.stdout.write(event.text);
    } else if (event.type === 'tool_call') {
      console.log(`Calling tool: ${event.toolName}`);
    } else if (event.type === 'tool_output') {
      console.log('Tool output received.');
    } else if (event.type === 'complete') {
      console.log('\nFinal response:\n');
      console.log(event.finalResponse);
    } else if (event.type === 'error') {
      throw new Error(event.message);
    }
  }
  await agent.stop('repo-agent-example');
} finally {
  await agent?.shutdown?.();
  await backend.close();
}
