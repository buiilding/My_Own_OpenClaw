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

export function buildLocalWindieSdk(repoRoot) {
  const packageDir = sdkDir(repoRoot);
  const tsc = path.join(packageDir, 'node_modules/.bin/tsc');
  const result = spawnSync(tsc, ['-p', 'tsconfig.build.json'], {
    cwd: packageDir,
    stdio: 'inherit',
  });
  if (result.status !== 0) {
    throw new Error(
      [
        'Could not build the local Windie SDK package.',
        'Run `cd packages/windie-sdk-js && npm install`, then retry this example.',
      ].join('\n'),
    );
  }
}

export async function loadLocalWindieSdk(repoRoot) {
  buildLocalWindieSdk(repoRoot);
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
        'Could not load the Windie SDK websocket dependency.',
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
