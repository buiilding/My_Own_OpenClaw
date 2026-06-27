/** @jest-environment node */

const path = require('path');

jest.mock('child_process', () => ({
  spawn: jest.fn(),
}));

jest.mock('fs', () => ({
  existsSync: jest.fn(() => true),
}));

jest.mock('electron', () => ({
  app: {
    isPackaged: false,
  },
  ipcMain: {
    on: jest.fn(),
  },
}));

const mockAppendWakewordLifecycleDiagnostic = jest.fn();
const PACKAGED_RESOURCES_ROOT = '/opt/agent-runtime/resources';
const PACKAGED_PYTHON_RUNTIME_ROOT = `${PACKAGED_RESOURCES_ROOT}/python-runtime`;
const SAMPLE_WAKEWORD_MODEL = 'sample_wakeword';
const HOST_RUNTIME_PATHS = Object.freeze({
  packagedEntrypointDirName: 'sample-host',
});
const HOST_WAKEWORD_ENV = Object.freeze({
  packagedApp: 'SAMPLE_PACKAGED_APP',
  allowRuntimeDownload: 'SAMPLE_WAKEWORD_ALLOW_RUNTIME_DOWNLOAD',
  modelName: 'SAMPLE_WAKEWORD_NAME',
});

jest.mock('../../src/main/diagnostics/app_diagnostics_runtime.cjs', () => ({
  appendWakewordLifecycleDiagnostic: (...args) => mockAppendWakewordLifecycleDiagnostic(...args),
}));

describe('wakeword_bridge', () => {
  let spawn;
  let ipcMain;
  let handlers;
  let stdoutHandler;
  let createdProcesses;
  let beforeExitHandler;

  beforeEach(() => {
    mockAppendWakewordLifecycleDiagnostic.mockClear();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const initBridge = ({
    isPackaged = false,
    mockExistsSync = null,
    mainWindow: suppliedMainWindow = null,
    runtimePaths = undefined,
    wakewordEnv = undefined,
    wakewordModelName = undefined,
    injectedIpcMain = null,
  } = {}) => {
    jest.resetModules();
    handlers = {};
    stdoutHandler = null;
    createdProcesses = [];
    beforeExitHandler = null;

    spawn = require('child_process').spawn;
    const electron = require('electron');
    const fs = require('fs');
    electron.app.isPackaged = isPackaged;
    if (typeof mockExistsSync === 'function') {
      fs.existsSync.mockImplementation(mockExistsSync);
    }
    ipcMain = electron.ipcMain;
    jest.spyOn(process, 'on').mockImplementation((event, handler) => {
      if (event === 'beforeExit') {
        beforeExitHandler = handler;
      }
      return process;
    });

    const createPythonProcess = () => {
      const processHandlers = {};
      const pythonProcess = {
        stdin: { write: jest.fn() },
        stdout: {
          on: jest.fn((event, handler) => {
            if (event === 'data') {
              pythonProcess._stdoutDataHandler = handler;
              stdoutHandler = handler;
            }
          }),
        },
        stderr: {
          on: jest.fn((event, handler) => {
            if (event === 'data') {
              pythonProcess._stderrDataHandler = handler;
            }
          }),
        },
        on: jest.fn((event, handler) => {
          processHandlers[event] = handler;
        }),
        kill: jest.fn(),
        _handlers: processHandlers,
      };
      createdProcesses.push(pythonProcess);
      return pythonProcess;
    };

    spawn.mockImplementation(createPythonProcess);
    ipcMain.on.mockImplementation((channel, handler) => {
      handlers[channel] = handler;
    });

    const bridge = require(path.join(
      __dirname,
      '../../src/main/wakeword/wakeword_bridge.cjs',
    ));

    const mainWindow = suppliedMainWindow || {
      webContents: {
        send: jest.fn(),
      },
    };
    const onWakewordDetected = jest.fn();

    bridge.initializeWakewordBridge(mainWindow, onWakewordDetected, {
      ...(runtimePaths ? { runtimePaths } : {}),
      ...(wakewordEnv ? { wakewordEnv } : {}),
      ...(wakewordModelName ? { wakewordModelName } : {}),
      ...(injectedIpcMain ? { ipcMain: injectedIpcMain } : {}),
    });

    return {
      bridge,
      mainWindow,
      onWakewordDetected,
      createdProcesses,
      beforeExitHandler,
    };
  };

  const emitDetection = (payload) => {
    const jsonBuffer = Buffer.from(JSON.stringify(payload));
    const lengthBuffer = Buffer.alloc(4);
    lengthBuffer.writeUInt32LE(jsonBuffer.length, 0);
    stdoutHandler(Buffer.concat([lengthBuffer, jsonBuffer]));
  };

  const emitRawBytes = (buffer) => {
    stdoutHandler(buffer);
  };

  const enableAndReady = () => {
    handlers['wakeword-enable']();
    expect(createdProcesses.length).toBeGreaterThan(0);
    createdProcesses[createdProcesses.length - 1]._stderrDataHandler(Buffer.from('{"status":"ready"}\n'));
  };

  test('fires wakeword callback and forwards detection', () => {
    const { mainWindow, onWakewordDetected } = initBridge();
    enableAndReady();

    emitDetection({
      detected: true,
      model: SAMPLE_WAKEWORD_MODEL,
      confidence: 0.91,
      score: 0.91,
    });

    expect(onWakewordDetected).toHaveBeenCalledTimes(1);
    expect(mainWindow.webContents.send).toHaveBeenCalledWith(
      'wakeword-detected',
      expect.objectContaining({
        model: SAMPLE_WAKEWORD_MODEL,
        confidence: 0.91,
        score: 0.91,
      }),
    );
    expect(mockAppendWakewordLifecycleDiagnostic).toHaveBeenCalledWith(expect.objectContaining({
      action: 'enabled',
      phase: 'toggle',
      enabled: true,
    }));
    expect(mockAppendWakewordLifecycleDiagnostic).toHaveBeenCalledWith(expect.objectContaining({
      action: 'process_spawned',
      phase: 'spawn',
    }));
    expect(mockAppendWakewordLifecycleDiagnostic).toHaveBeenCalledWith(expect.objectContaining({
      action: 'status_ready',
      phase: 'stderr',
      ready: true,
    }));
    expect(mockAppendWakewordLifecycleDiagnostic).toHaveBeenCalledWith(expect.objectContaining({
      action: 'detected',
      phase: 'stdout',
      modelId: SAMPLE_WAKEWORD_MODEL,
      confidence: 0.91,
      score: 0.91,
    }));
  });

  test('registers wakeword channels on an injected host IPC adapter', () => {
    const injectedHandlers = {};
    const injectedIpcMain = {
      on: jest.fn((channel, handler) => {
        injectedHandlers[channel] = handler;
      }),
    };

    const { mainWindow, onWakewordDetected, createdProcesses } = initBridge({
      injectedIpcMain,
    });

    expect(ipcMain.on).not.toHaveBeenCalled();
    expect(injectedIpcMain.on).toHaveBeenCalledWith('wakeword-audio-chunk', expect.any(Function));
    expect(injectedIpcMain.on).toHaveBeenCalledWith('wakeword-enable', expect.any(Function));
    expect(injectedIpcMain.on).toHaveBeenCalledWith('wakeword-disable', expect.any(Function));

    injectedHandlers['wakeword-enable']();
    expect(createdProcesses.length).toBeGreaterThan(0);
    createdProcesses[createdProcesses.length - 1]._stderrDataHandler(Buffer.from('{"status":"ready"}\n'));

    const jsonBuffer = Buffer.from(JSON.stringify({
      detected: true,
      model: SAMPLE_WAKEWORD_MODEL,
      confidence: 0.92,
      score: 0.92,
    }));
    const lengthBuffer = Buffer.alloc(4);
    lengthBuffer.writeUInt32LE(jsonBuffer.length, 0);
    stdoutHandler(Buffer.concat([lengthBuffer, jsonBuffer]));

    expect(onWakewordDetected).toHaveBeenCalledTimes(1);
    expect(mainWindow.webContents.send).toHaveBeenCalledWith(
      'wakeword-detected',
      expect.objectContaining({
        model: SAMPLE_WAKEWORD_MODEL,
        confidence: 0.92,
      }),
    );
  });

  test('fails fast when wakeword IPC adapter is missing', () => {
    jest.resetModules();
    const bridge = require(path.join(
      __dirname,
      '../../src/main/wakeword/wakeword_bridge.cjs',
    ));

    expect(() => bridge.initializeWakewordBridge(null, jest.fn(), { ipcMain: {} }))
      .toThrow('initializeWakewordBridge requires an ipcMain-compatible adapter');
  });

  test('does not forward detection to a destroyed main window', () => {
    const destroyedMainWindow = {
      isDestroyed: () => true,
      webContents: {
        send: jest.fn(),
      },
    };
    const { onWakewordDetected } = initBridge({ mainWindow: destroyedMainWindow });
    enableAndReady();

    emitDetection({
      detected: true,
      model: SAMPLE_WAKEWORD_MODEL,
      confidence: 0.91,
      score: 0.91,
    });

    expect(onWakewordDetected).toHaveBeenCalledTimes(1);
    expect(destroyedMainWindow.webContents.send).not.toHaveBeenCalledWith(
      'wakeword-detected',
      expect.anything(),
    );
  });

  test('ignores detection when wakeword disabled', () => {
    const { mainWindow, onWakewordDetected } = initBridge();
    enableAndReady();

    handlers['wakeword-disable']();

    emitDetection({
      detected: true,
      model: SAMPLE_WAKEWORD_MODEL,
      confidence: 0.99,
      score: 0.99,
    });

    expect(onWakewordDetected).not.toHaveBeenCalled();
    expect(mainWindow.webContents.send).not.toHaveBeenCalledWith(
      'wakeword-detected',
      expect.anything(),
    );
    expect(mockAppendWakewordLifecycleDiagnostic).toHaveBeenCalledWith(expect.objectContaining({
      action: 'disabled',
      phase: 'toggle',
      enabled: false,
    }));
  });

  test('preserves wakeword callback after process restart', () => {
    const { mainWindow, onWakewordDetected, createdProcesses } = initBridge();

    enableAndReady();
    expect(createdProcesses).toHaveLength(1);
    createdProcesses[0]._handlers.exit(0, null);

    handlers['wakeword-enable']();
    expect(createdProcesses).toHaveLength(2);
    createdProcesses[1]._stderrDataHandler(Buffer.from('{"status":"ready"}\n'));

    emitDetection({
      detected: true,
      model: SAMPLE_WAKEWORD_MODEL,
      confidence: 0.93,
      score: 0.93,
    });

    expect(onWakewordDetected).toHaveBeenCalledTimes(1);
    expect(mainWindow.webContents.send).toHaveBeenCalledWith(
      'wakeword-detected',
      expect.objectContaining({
        model: SAMPLE_WAKEWORD_MODEL,
        confidence: 0.93,
      }),
    );
  });

  test('clears stale partial result buffer across process restart', () => {
    const { mainWindow, onWakewordDetected, createdProcesses } = initBridge();
    enableAndReady();

    // Inject incomplete frame bytes so old process leaves parser state behind.
    const partialHeader = Buffer.alloc(4);
    partialHeader.writeUInt32LE(1024, 0);
    emitRawBytes(partialHeader);

    createdProcesses[0]._handlers.exit(0, null);
    handlers['wakeword-enable']();
    expect(createdProcesses).toHaveLength(2);

    emitDetection({
      detected: true,
      model: SAMPLE_WAKEWORD_MODEL,
      confidence: 0.95,
      score: 0.95,
    });

    expect(onWakewordDetected).toHaveBeenCalledTimes(1);
    expect(mainWindow.webContents.send).toHaveBeenCalledWith(
      'wakeword-detected',
      expect.objectContaining({
        model: SAMPLE_WAKEWORD_MODEL,
        confidence: 0.95,
      }),
    );
  });

  test('rejects oversized detection result frames and clears the buffer', () => {
    const { mainWindow, onWakewordDetected } = initBridge();
    enableAndReady();

    const oversizedHeader = Buffer.alloc(4);
    oversizedHeader.writeUInt32LE(64 * 1024 + 1, 0);
    emitRawBytes(oversizedHeader);

    expect(console.error).not.toHaveBeenCalledWith(
      expect.stringContaining('Invalid detection result frame length'),
    );
    expect(mockAppendWakewordLifecycleDiagnostic).toHaveBeenCalledWith(expect.objectContaining({
      action: 'invalid_frame',
      phase: 'stdout',
      status: 'failed',
      frameBytes: 64 * 1024 + 1,
      maxFrameBytes: 64 * 1024,
    }));
    expect(onWakewordDetected).not.toHaveBeenCalled();
    expect(mainWindow.webContents.send).not.toHaveBeenCalledWith(
      'wakeword-detected',
      expect.anything(),
    );

    emitDetection({
      detected: true,
      model: SAMPLE_WAKEWORD_MODEL,
      confidence: 0.96,
      score: 0.96,
    });

    expect(onWakewordDetected).toHaveBeenCalledTimes(1);
    expect(mainWindow.webContents.send).toHaveBeenCalledWith(
      'wakeword-detected',
      expect.objectContaining({
        model: SAMPLE_WAKEWORD_MODEL,
        confidence: 0.96,
      }),
    );
  });

  test('ignores stale exit from old process after beforeExit/enable restart', () => {
    const { createdProcesses, beforeExitHandler } = initBridge();
    enableAndReady();

    expect(typeof beforeExitHandler).toBe('function');
    beforeExitHandler();
    handlers['wakeword-enable']();
    expect(createdProcesses).toHaveLength(2);

    createdProcesses[1]._stderrDataHandler(Buffer.from('{"status":"ready"}\n'));

    handlers['wakeword-audio-chunk'](null, Buffer.from([1, 2, 3, 4]));
    expect(createdProcesses[1].stdin.write).toHaveBeenCalledTimes(2);

    createdProcesses[0]._handlers.exit(0, null);

    handlers['wakeword-audio-chunk'](null, Buffer.from([5, 6, 7, 8]));
    expect(createdProcesses[1].stdin.write).toHaveBeenCalledTimes(4);
  });

  test('clears stale partial stderr buffer across beforeExit/enable restart', () => {
    const { mainWindow, createdProcesses, beforeExitHandler } = initBridge();
    enableAndReady();

    createdProcesses[0]._stderrDataHandler(Buffer.from('{"status":"rea'));

    expect(typeof beforeExitHandler).toBe('function');
    beforeExitHandler();
    handlers['wakeword-enable']();
    expect(createdProcesses).toHaveLength(2);

    createdProcesses[1]._stderrDataHandler(Buffer.from('{"status":"ready"}\n'));

    expect(mainWindow.webContents.send).toHaveBeenCalledWith(
      'wakeword-status',
      { ready: true },
    );
  });

  test('ignores EPIPE logging when wakeword process exits', () => {
    const { createdProcesses } = initBridge();
    enableAndReady();

    console.log.mockImplementation(() => {
      const error = new Error('write EPIPE');
      error.code = 'EPIPE';
      throw error;
    });

    expect(() => {
      createdProcesses[0]._handlers.exit(0, null);
    }).not.toThrow();
  });

  test('maps ENOENT process start failures to wakeword-status error payload', () => {
    const { mainWindow, createdProcesses } = initBridge();

    handlers['wakeword-enable']();
    expect(createdProcesses).toHaveLength(1);

    createdProcesses[0]._handlers.error?.({
      code: 'ENOENT',
      message: 'spawn failed',
    });

    expect(mainWindow.webContents.send).toHaveBeenCalledWith(
      'wakeword-status',
      expect.objectContaining({
        ready: false,
        error: expect.stringContaining("Python executable"),
      }),
    );
  });

  test('stops writing audio after wakeword service reports an error status', () => {
    const { mainWindow, createdProcesses } = initBridge();
    enableAndReady();

    handlers['wakeword-audio-chunk'](null, Buffer.from([1, 2, 3, 4]));
    expect(createdProcesses[0].stdin.write).toHaveBeenCalledTimes(2);

    createdProcesses[0]._stderrDataHandler(Buffer.from('{"status":"error","message":"model failed"}\n'));
    handlers['wakeword-audio-chunk'](null, Buffer.from([5, 6, 7, 8]));

    expect(createdProcesses[0].stdin.write).toHaveBeenCalledTimes(2);
    expect(mainWindow.webContents.send).toHaveBeenCalledWith(
      'wakeword-status',
      {
        ready: false,
        error: 'model failed',
      },
    );
  });

  test('allows wakeword service to recover readiness after an error status', () => {
    const { createdProcesses } = initBridge();
    enableAndReady();

    createdProcesses[0]._stderrDataHandler(Buffer.from('{"status":"error","message":"model failed"}\n'));
    createdProcesses[0]._stderrDataHandler(Buffer.from('{"status":"ready"}\n'));
    handlers['wakeword-audio-chunk'](null, Buffer.from([1, 2, 3, 4]));

    expect(createdProcesses[0].stdin.write).toHaveBeenCalledTimes(2);
  });

  test('packaged mode disables wakeword runtime model downloads', () => {
    const originalResourcesPath = process.resourcesPath;
    process.resourcesPath = PACKAGED_RESOURCES_ROOT;
    const runtimePython = process.platform === 'win32'
      ? `${PACKAGED_PYTHON_RUNTIME_ROOT}/python.exe`
      : `${PACKAGED_PYTHON_RUNTIME_ROOT}/bin/python3`;

    try {
      initBridge({
        isPackaged: true,
        mockExistsSync: (candidate) => {
          const normalizedCandidate = String(candidate || '').replace(/\\/g, '/');
          return (
            normalizedCandidate === `${PACKAGED_PYTHON_RUNTIME_ROOT}/local-runtime/wakeword_service.pyc`
            || normalizedCandidate === runtimePython
          );
        },
      });
      handlers['wakeword-enable']();

      const spawnOptions = spawn.mock.calls[0][2];
      expect(spawnOptions.env).toEqual(expect.objectContaining({
        AGENT_PACKAGED_APP: '1',
        AGENT_WAKEWORD_ALLOW_RUNTIME_DOWNLOAD: '0',
        PYTHONDONTWRITEBYTECODE: '1',
      }));
      if (process.platform === 'win32') {
        expect(spawnOptions.env.PYTHONHOME).toBeUndefined();
        expect(spawnOptions.env.PYTHONNOUSERSITE).toBeUndefined();
      } else {
        expect(String(spawnOptions.env.PYTHONHOME).replace(/\\/g, '/'))
          .toBe(PACKAGED_PYTHON_RUNTIME_ROOT);
        expect(spawnOptions.env.PYTHONNOUSERSITE).toBe('1');
      }
      expect(spawnOptions.env.PYTHONPATH).toBeUndefined();
    } finally {
      process.resourcesPath = originalResourcesPath;
    }
  });

  test('packaged mode uses configured host wakeword env names', () => {
    const originalResourcesPath = process.resourcesPath;
    process.resourcesPath = PACKAGED_RESOURCES_ROOT;
    const runtimePython = process.platform === 'win32'
      ? `${PACKAGED_PYTHON_RUNTIME_ROOT}/python.exe`
      : `${PACKAGED_PYTHON_RUNTIME_ROOT}/bin/python3`;

    try {
      initBridge({
        isPackaged: true,
        runtimePaths: HOST_RUNTIME_PATHS,
        wakewordEnv: HOST_WAKEWORD_ENV,
        wakewordModelName: SAMPLE_WAKEWORD_MODEL,
        mockExistsSync: (candidate) => {
          const normalizedCandidate = String(candidate || '').replace(/\\/g, '/');
          return (
            normalizedCandidate === `${PACKAGED_PYTHON_RUNTIME_ROOT}/sample-host/wakeword_service.pyc`
            || normalizedCandidate === runtimePython
          );
        },
      });
      handlers['wakeword-enable']();

      const spawnOptions = spawn.mock.calls[0][2];
      expect(spawnOptions.env).toEqual(expect.objectContaining({
        AGENT_PACKAGED_APP: '1',
        AGENT_WAKEWORD_ALLOW_RUNTIME_DOWNLOAD: '0',
        AGENT_WAKEWORD_NAME: SAMPLE_WAKEWORD_MODEL,
        SAMPLE_PACKAGED_APP: '1',
        SAMPLE_WAKEWORD_ALLOW_RUNTIME_DOWNLOAD: '0',
        SAMPLE_WAKEWORD_NAME: SAMPLE_WAKEWORD_MODEL,
        PYTHONDONTWRITEBYTECODE: '1',
      }));
    } finally {
      process.resourcesPath = originalResourcesPath;
    }
  });

  test('maps non-zero wakeword process exits to wakeword-status error payload', () => {
    const { mainWindow, createdProcesses } = initBridge();

    handlers['wakeword-enable']();
    expect(createdProcesses).toHaveLength(1);

    createdProcesses[0]._handlers.exit?.(7, null);

    expect(mainWindow.webContents.send).toHaveBeenCalledWith(
      'wakeword-status',
      {
        ready: false,
        error: 'Python process exited with code 7',
      },
    );
  });
});
