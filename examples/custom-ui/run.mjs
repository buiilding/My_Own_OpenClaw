#!/usr/bin/env node
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { promises as fs } from 'node:fs';
import { spawnSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const wsModule = require('../../frontend/node_modules/ws');
const WebSocketServer = wsModule.WebSocketServer || wsModule.Server;

const exampleDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(exampleDir, '../..');
const sdkDist = path.join(repoRoot, 'packages/windie-sdk-js/dist');

function buildLocalSdk() {
  const result = spawnSync(
    path.join(repoRoot, 'frontend/node_modules/.bin/tsc'),
    ['-p', 'tsconfig.build.json'],
    {
      cwd: path.join(repoRoot, 'packages/windie-sdk-js'),
      stdio: 'inherit',
    },
  );
  if (result.status !== 0) {
    throw new Error('Could not build the local Windie SDK. Run `cd frontend && npm install`, then retry.');
  }
}

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

buildLocalSdk();
const { server, wss } = createServer();
const address = await new Promise(resolve => {
  server.listen(0, '127.0.0.1', () => resolve(server.address()));
});
const url = `http://127.0.0.1:${address.port}`;

if (process.argv.includes('--smoke')) {
  const response = await fetch(url);
  if (!response.ok || !(await response.text()).includes('Windie SDK Custom UI')) {
    throw new Error('Custom UI smoke check failed');
  }
  await new Promise(resolve => wss.close(() => server.close(resolve)));
  console.log(`custom-ui smoke ok: ${url}`);
} else {
  console.log(`Open ${url}`);
}
