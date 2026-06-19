/**
 * Provides the local sdk loader module for the example application workspace.
 */

import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

function sdkDir(repoRoot) {
  return path.join(repoRoot, 'packages/windie-sdk-js');
}

function sdkPackageJson(repoRoot) {
  return path.join(sdkDir(repoRoot), 'package.json');
}

export function buildLocalAgentSdk(repoRoot) {
  const packageDir = sdkDir(repoRoot);
  const command = process.platform === 'win32'
    ? process.env.ComSpec || 'cmd.exe'
    : 'npm';
  const args = process.platform === 'win32'
    ? ['/d', '/c', 'npm.cmd run build:esm']
    : ['run', 'build:esm'];
  const result = spawnSync(command, args, {
    cwd: packageDir,
    stdio: 'inherit',
  });
  if (result.status !== 0) {
    throw new Error(
      [
        'Could not build the local Agent SDK package.',
        'Run `cd packages/windie-sdk-js && npm install`, then retry this example.',
      ].join('\n'),
    );
  }
}

export async function loadLocalAgentSdk(repoRoot) {
  buildLocalAgentSdk(repoRoot);
  return import(pathToFileURL(path.join(sdkDir(repoRoot), 'dist/index.js')).href);
}

export function loadSdkWebSocket(repoRoot) {
  const requireFromSdk = createRequire(pathToFileURL(sdkPackageJson(repoRoot)).href);
  let wsModule;
  try {
    wsModule = requireFromSdk('ws');
  } catch (error) {
    throw new Error(
      [
        'Could not load the Agent SDK websocket dependency.',
        'Run `cd packages/windie-sdk-js && npm install`, then retry this example.',
        error instanceof Error ? error.message : String(error),
      ].join('\n'),
    );
  }
  return {
    WebSocketServer: wsModule.WebSocketServer || wsModule.Server,
    WebSocketImpl: wsModule.WebSocket || wsModule,
  };
}
