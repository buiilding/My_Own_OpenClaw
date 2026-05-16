#!/usr/bin/env node
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promises as fs } from 'node:fs';
import { spawn } from 'node:child_process';
import {
  loadLocalWindieSdk,
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
    res.end(JSON.stringify({ ok: true, service: 'windie-local-tool-extension-example' }));
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
          { text: 'Mock backend is asking the sidecar to save a note.\n' },
          { conversation_ref: conversationRef, turn_ref: turnRef },
        );
        send(
          socket,
          'tool-call',
          {
            tool_name: toolName,
            tool_call_id: 'local-tool-extension-provider-call',
            parameters: {
              text: 'Windie local module tools execute through the sidecar.',
              filename: 'windie-local-tool-extension.txt',
            },
            request_id: 'local-tool-extension-tool-call',
          },
          { conversation_ref: conversationRef, turn_ref: turnRef },
        );
        return;
      }

      if (message.type === 'tool-result') {
        const content = message.payload?.data?.llm_content || 'No local tool content returned.';
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

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

async function waitForDiscovery(discoveryFile, child) {
  const deadline = Date.now() + 15000;
  let lastError = null;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`sidecar daemon exited early with code ${child.exitCode}`);
    }
    try {
      const discovery = await readJson(discoveryFile);
      if (discovery.base_url && discovery.token) {
        return discovery;
      }
    } catch (error) {
      lastError = error;
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`timed out waiting for sidecar discovery: ${lastError?.message || discoveryFile}`);
}

async function startSidecar() {
  const discoveryFile = path.join(
    os.tmpdir(),
    `windie-local-tool-extension-${process.pid}-${Date.now()}.json`,
  );
  const daemonScript = path.join(repoRoot, 'frontend/src/main/python/sidecar_daemon.py');
  const launcher = path.join(repoRoot, 'scripts/python-in-env');
  const child = spawn(
    launcher,
    ['sidecar', 'python', daemonScript, '--discovery-file', discoveryFile],
    {
      cwd: repoRoot,
      stdio: ['ignore', 'ignore', 'pipe'],
    },
  );
  let stderr = '';
  child.stderr.on('data', chunk => {
    stderr += chunk.toString();
  });
  const discovery = await waitForDiscovery(discoveryFile, child).catch(error => {
    if (stderr.trim()) {
      throw new Error(`${error.message}\n${stderr.trim()}`);
    }
    throw error;
  });
  return {
    baseUrl: discovery.base_url,
    token: discovery.token,
    child,
  };
}

const {
  WindieClient,
  moduleTool,
} = await loadLocalWindieSdk(repoRoot);

const backend = await createMockBackend();
const sidecar = await startSidecar();
const client = new WindieClient({
  backendUrl: backend.backendUrl,
  WebSocketImpl,
  sidecarDaemon: {
    baseUrl: sidecar.baseUrl,
    token: sidecar.token,
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

  for await (const event of agent.stream('Save a local note through the sidecar.', {
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
  agent?.sleep();
  await client.shutdownLocalRuntime().catch(() => {});
  sidecar.child.kill('SIGTERM');
  await backend.close();
}
