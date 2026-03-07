/** @jest-environment node */

const {
  handleWakewordStderrLine,
  normalizeAudioChunk,
  resolveWakewordProcessErrorMessage,
  resolveWakewordStartErrorMessage,
} = require('../../frontend/src/main/wakeword_bridge_runtime.cjs');

describe('wakeword_bridge_runtime', () => {
  test('maps missing launch command to packaged and dev-facing startup errors', () => {
    expect(resolveWakewordStartErrorMessage({
      launchTarget: { kind: 'python', command: null },
      packagedApp: false,
    })).toContain('Python executable not found');

    expect(resolveWakewordStartErrorMessage({
      launchTarget: { kind: 'python', command: null },
      packagedApp: true,
    })).toContain('Bundled Python runtime not found');
  });

  test('normalizes audio chunks from supported payload types', () => {
    expect(normalizeAudioChunk(Buffer.from([1, 2, 3]))).toEqual(Buffer.from([1, 2, 3]));
    expect(normalizeAudioChunk(Buffer.from([1, 2]).toString('base64'))).toEqual(Buffer.from([1, 2]));
    expect(normalizeAudioChunk(Uint8Array.from([4, 5]).buffer)).toEqual(Buffer.from([4, 5]));
    expect(normalizeAudioChunk({})).toBeNull();
  });

  test('promotes ready/status stderr JSON to wakeword status updates', () => {
    const mainWindow = {
      webContents: {
        send: jest.fn(),
      },
    };
    let isReady = false;

    handleWakewordStderrLine({
      line: '{"status":"ready"}',
      mainWindow,
      getIsPythonReady: () => isReady,
      setIsPythonReady: (nextReady) => {
        isReady = nextReady;
      },
    });

    expect(isReady).toBe(true);
    expect(mainWindow.webContents.send).toHaveBeenCalledWith('wakeword-status', { ready: true });
  });

  test('resolves ENOENT process errors with executable-specific guidance', () => {
    expect(resolveWakewordProcessErrorMessage({
      launchTarget: { kind: 'binary', command: 'wakeword-bin' },
      error: { code: 'ENOENT', message: 'spawn ENOENT' },
    })).toContain("Bundled wakeword executable 'wakeword-bin' not found");

    expect(resolveWakewordProcessErrorMessage({
      launchTarget: { kind: 'python', command: 'python3' },
      error: { code: 'ENOENT', message: 'spawn ENOENT' },
    })).toContain("Python executable 'python3' not found");
  });
});
