/** @jest-environment node */

const {
  emitWakewordStatus,
  handleWakewordStderrLine,
  normalizeAudioChunk,
  normalizeWakewordStderrLogMarkers,
  resolveWakewordProcessErrorMessage,
  resolveWakewordStartErrorMessage,
  shouldLogWakewordStderrLine,
} = require('../../src/main/wakeword/wakeword_bridge_runtime.cjs');

const SAMPLE_BUNDLED_RUNTIME_COPY = Object.freeze({
  missingPythonRuntime: 'Bundled Python runtime not found in app resources. Please reinstall SampleApp.',
});
const SAMPLE_WAKEWORD_MARKER = 'sample_wakeword';

describe('wakeword_bridge_runtime', () => {
  test('maps missing launch command to packaged and dev-facing startup errors', () => {
    expect(resolveWakewordStartErrorMessage({
      launchTarget: { kind: 'python', command: null },
      packagedApp: false,
    })).toContain('Python executable not found');

    expect(resolveWakewordStartErrorMessage({
      launchTarget: { kind: 'python', command: null },
      packagedApp: true,
      copy: SAMPLE_BUNDLED_RUNTIME_COPY,
    })).toContain('Bundled Python runtime not found');
  });

  test('uses generic packaged startup fallback without host skin copy', () => {
    expect(resolveWakewordStartErrorMessage({
      launchTarget: { kind: 'python', command: null },
      packagedApp: true,
    })).toContain('Please reinstall this app');
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

  test('does not emit wakeword status to a destroyed BrowserWindow', () => {
    const mainWindow = {
      isDestroyed: () => true,
      webContents: {
        send: jest.fn(),
      },
    };

    expect(emitWakewordStatus(mainWindow, { ready: false })).toBe(false);
    expect(mainWindow.webContents.send).not.toHaveBeenCalled();
  });

  test('does not emit wakeword status to destroyed webContents', () => {
    const mainWindow = {
      isDestroyed: () => false,
      webContents: {
        isDestroyed: () => true,
        send: jest.fn(),
      },
    };

    expect(emitWakewordStatus(mainWindow, { ready: false })).toBe(false);
    expect(mainWindow.webContents.send).not.toHaveBeenCalled();
  });

  test('does not throw when wakeword status send races with window destruction', () => {
    const mainWindow = {
      isDestroyed: () => false,
      webContents: {
        isDestroyed: () => false,
        send: jest.fn(() => {
          throw new Error('Object has been destroyed');
        }),
      },
    };

    expect(emitWakewordStatus(mainWindow, { ready: false })).toBe(false);
  });

  test('rethrows non-destroyed wakeword status send failures', () => {
    const mainWindow = {
      isDestroyed: () => false,
      webContents: {
        isDestroyed: () => false,
        send: jest.fn(() => {
          throw new Error('send failed');
        }),
      },
    };

    expect(() => emitWakewordStatus(mainWindow, { ready: false })).toThrow('send failed');
  });

  test('promotes error/status stderr JSON to not-ready wakeword status updates', () => {
    const mainWindow = {
      webContents: {
        send: jest.fn(),
      },
    };
    let readiness = null;

    handleWakewordStderrLine({
      line: '{"status":"error","message":"model failed"}',
      mainWindow,
      getIsPythonReady: () => true,
      setIsPythonReady: (nextReady, errorMessage) => {
        readiness = { nextReady, errorMessage };
      },
      error: jest.fn(),
    });

    expect(readiness).toEqual({ nextReady: false, errorMessage: 'model failed' });
    expect(mainWindow.webContents.send).toHaveBeenCalledWith(
      'wakeword-status',
      { ready: false, error: 'model failed' },
    );
  });

  test('uses neutral wakeword stderr log markers by default', () => {
    const markers = normalizeWakewordStderrLogMarkers();

    expect(shouldLogWakewordStderrLine('[Python] loaded model', markers)).toBe(true);
    expect(shouldLogWakewordStderrLine('*** DETECTED *** generic-model', markers)).toBe(true);
    expect(shouldLogWakewordStderrLine(`score update for ${SAMPLE_WAKEWORD_MARKER}`, markers)).toBe(false);
  });

  test('logs host-configured wakeword stderr markers', () => {
    const log = jest.fn();

    handleWakewordStderrLine({
      line: `score update for ${SAMPLE_WAKEWORD_MARKER}`,
      mainWindow: null,
      getIsPythonReady: () => false,
      setIsPythonReady: jest.fn(),
      logMarkers: [SAMPLE_WAKEWORD_MARKER],
      log,
    });

    expect(log).toHaveBeenCalledWith(`score update for ${SAMPLE_WAKEWORD_MARKER}`);
  });

  test('does not log host wakeword markers without host config', () => {
    const log = jest.fn();

    handleWakewordStderrLine({
      line: `score update for ${SAMPLE_WAKEWORD_MARKER}`,
      mainWindow: null,
      getIsPythonReady: () => false,
      setIsPythonReady: jest.fn(),
      log,
    });

    expect(log).not.toHaveBeenCalled();
  });

  test('resolves ENOENT process errors with Python executable guidance', () => {
    expect(resolveWakewordProcessErrorMessage({
      launchTarget: { kind: 'python', command: 'python3' },
      error: { code: 'ENOENT', message: 'spawn ENOENT' },
    })).toContain("Python executable 'python3' not found");
  });
});
