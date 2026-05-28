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

  test('main SDK host starts the high-level desktop agent instead of the old runtime wrapper', async () => {
    const source = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/main/windie_agent_host.cjs'),
      'utf8',
    );

    expect(source).toContain('WindieAgent.startDesktop');
    expect(source).not.toContain('createWindieSdkMainRuntime');
    expect(source).not.toContain('createManagedBackendSession');
    expect(source).not.toContain('sendSdkRuntimeCommand');
  });
});
