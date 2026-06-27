#!/usr/bin/env node
/**
 * Runs the run workflow for the example application workspace.
 */

import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promises as fs } from 'node:fs';
import {
  buildLocalAgentSdk,
  loadSdkWebSocket,
} from '../_shared/local_sdk_loader.mjs';

const exampleDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(exampleDir, '../..');
const sdkDist = path.join(repoRoot, 'packages/windie-sdk-js/dist');
const { WebSocketServer } = loadSdkWebSocket(repoRoot);

async function sendFile(res, filePath, contentType) {
  try {
    const content = await fs.readFile(filePath);
    res.writeHead(200, { 'content-type': contentType });
    res.end(content);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('not found');
  }
}

function createServer() {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || '/', 'http://127.0.0.1');
    if (url.pathname === '/api/sdk/models') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        config: {
          model_mode: 'online',
          model_provider: 'hosted-provider',
          selected_model_id: 'hosted-model',
          interaction_mode: 'agent',
        },
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
    if (url.pathname.startsWith('/sdk/')) {
      const sdkFile = path.join(sdkDist, url.pathname.slice('/sdk/'.length));
      const contentType = sdkFile.endsWith('.js') ? 'text/javascript' : 'application/json';
      await sendFile(res, sdkFile, contentType);
      return;
    }
    await sendFile(res, path.join(exampleDir, 'index.html'), 'text/html');
  });
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', socket => {
    socket.on('message', raw => {
      const message = JSON.parse(raw.toString());
      if (message.type === 'update-settings') {
        return;
      }
      if (message.type !== 'query') {
        return;
      }
      const conversationRef = message.payload?.conversation_ref || 'custom-ui-example';
      const turnRef = message.payload?.turn_ref || null;
      socket.send(JSON.stringify({
        type: 'streaming-response',
        conversation_ref: conversationRef,
        turn_ref: turnRef,
        payload: {
          text: `Custom UI mock backend received: ${message.payload?.text || ''}\n`,
        },
      }));
      socket.send(JSON.stringify({
        type: 'streaming-complete',
        conversation_ref: conversationRef,
        turn_ref: turnRef,
        payload: {
          final_response: 'Custom UI example complete.',
        },
      }));
    });
  });

  return { server, wss };
}

buildLocalAgentSdk(repoRoot);
const { server, wss } = createServer();
const address = await new Promise(resolve => {
  server.listen(0, '127.0.0.1', () => resolve(server.address()));
});
const url = `http://127.0.0.1:${address.port}`;

if (process.argv.includes('--smoke')) {
  const response = await fetch(url);
  if (!response.ok || !(await response.text()).includes('Agent SDK Custom UI')) {
    throw new Error('Custom UI smoke check failed');
  }
  await new Promise(resolve => wss.close(() => server.close(resolve)));
  console.log(`custom-ui smoke ok: ${url}`);
} else {
  console.log(`Open ${url}`);
}
