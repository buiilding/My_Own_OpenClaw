/** @jest-environment node */

const fs = require('fs/promises');
const path = require('path');

describe('main ipc sdk runtime boundary', () => {
  test('ipc.cjs does not call low-level SDK runtime send methods directly', async () => {
    const source = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/main/ipc.cjs'),
      'utf8',
    );
    const directRuntimeSendPattern = /\.(sendBackendMessage|sendQuery|sendWakewordDetected|sendStopQuery|sendUpdateSettings|sendListModels)\s*\(/g;

    expect(source.match(directRuntimeSendPattern) || []).toEqual([]);
  });

  test('main SDK runtime delegates websocket construction to the backend transport module', async () => {
    const source = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/main/windie_sdk_runtime.cjs'),
      'utf8',
    );

    expect(source).not.toContain('new WebSocketImpl');
    expect(source).toContain('createWindieSdkBackendSocket');
  });
});
