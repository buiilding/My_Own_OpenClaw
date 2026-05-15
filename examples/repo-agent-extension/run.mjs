#!/usr/bin/env node
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promises as fs } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const wsModule = require('../../frontend/node_modules/ws');
const WebSocketServer = wsModule.WebSocketServer || wsModule.Server;
const WebSocketImpl = wsModule.WebSocket || wsModule;

const exampleDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(exampleDir, '../..');

function ensureSdkBuild() {
  const sdkDir = path.join(repoRoot, 'packages/windie-sdk-js');
  const tsc = path.join(repoRoot, 'frontend/node_modules/.bin/tsc');
  try {
    const result = spawnSync(tsc, ['-p', 'tsconfig.build.json'], {
      cwd: sdkDir,
      stdio: 'inherit',
    });
    if (result.status !== 0) {
      throw new Error(`TypeScript SDK build exited with ${result.status}`);
    }
  } catch (error) {
    throw new Error(
      [
        'Could not build the local TypeScript SDK package.',
        'Run `cd frontend && npm install`, then retry this example.',
        error instanceof Error ? error.message : String(error),
      ].join('\n'),
    );
  }
}

ensureSdkBuild();
const sdkPath = path.join(repoRoot, 'packages/windie-sdk-js/dist/index.js');
const { WindieClient } = await import(pathToFileURL(sdkPath).href);

function send(socket, type, payload = {}, extra = {}) {
  socket.send(JSON.stringify({ type, payload, ...extra }));
}

function createMockBackend() {
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, service: 'windie-repo-agent-example' }));
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
        const content = message.payload?.data?.llm_content || 'No tool content returned.';
        const requestId = message.payload?.request_id;
        send(
          socket,
          'tool-output',
          {
            tool_name: toolName,
            request_id: requestId,
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
    `windie-repo-agent-example-${process.pid}-${Date.now()}.json`,
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

const backend = await createMockBackend().listen();
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
} finally {
  agent?.sleep();
  await client.shutdownLocalRuntime().catch(() => {});
  sidecar.child.kill('SIGTERM');
  await backend.close();
}
