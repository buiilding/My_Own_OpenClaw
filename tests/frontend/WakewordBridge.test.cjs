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

describe('wakeword_bridge', () => {
  let spawn;
  let ipcMain;
  let handlers;
  let stdoutHandler;
  let createdProcesses;
  let beforeExitHandler;

  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const initBridge = ({ isPackaged = false, mockExistsSync = null } = {}) => {
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
      '../../frontend/src/main/wakeword_bridge.cjs',
    ));

    const mainWindow = {
      webContents: {
        send: jest.fn(),
      },
    };
    const onWakewordDetected = jest.fn();

    bridge.initializeWakewordBridge(mainWindow, onWakewordDetected);

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
      model: 'hey_jarvis',
      confidence: 0.91,
      score: 0.91,
    });

    expect(onWakewordDetected).toHaveBeenCalledTimes(1);
    expect(mainWindow.webContents.send).toHaveBeenCalledWith(
      'wakeword-detected',
      expect.objectContaining({
        model: 'hey_jarvis',
        confidence: 0.91,
        score: 0.91,
      }),
    );
  });

  test('ignores detection when wakeword disabled', () => {
    const { mainWindow, onWakewordDetected } = initBridge();
    enableAndReady();

    handlers['wakeword-disable']();

    emitDetection({
      detected: true,
      model: 'hey_jarvis',
      confidence: 0.99,
      score: 0.99,
    });

    expect(onWakewordDetected).not.toHaveBeenCalled();
    expect(mainWindow.webContents.send).not.toHaveBeenCalledWith(
      'wakeword-detected',
      expect.anything(),
    );
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
      model: 'hey_jarvis',
      confidence: 0.93,
      score: 0.93,
    });

    expect(onWakewordDetected).toHaveBeenCalledTimes(1);
    expect(mainWindow.webContents.send).toHaveBeenCalledWith(
      'wakeword-detected',
      expect.objectContaining({
        model: 'hey_jarvis',
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
      model: 'hey_jarvis',
      confidence: 0.95,
      score: 0.95,
    });

    expect(onWakewordDetected).toHaveBeenCalledTimes(1);
    expect(mainWindow.webContents.send).toHaveBeenCalledWith(
      'wakeword-detected',
      expect.objectContaining({
        model: 'hey_jarvis',
        confidence: 0.95,
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

  test('packaged mode disables wakeword runtime model downloads', () => {
    const originalResourcesPath = process.resourcesPath;
    process.resourcesPath = '/opt/WindieOS/resources';

    try {
      initBridge({
        isPackaged: true,
        mockExistsSync: (candidate) => (
          candidate === '/opt/WindieOS/resources/python-runtime/sidecar/wakeword_service.pyc'
          || candidate === '/opt/WindieOS/resources/python-runtime/bin/python3'
        ),
      });
      handlers['wakeword-enable']();

      const spawnOptions = spawn.mock.calls[0][2];
      expect(spawnOptions.env).toEqual(expect.objectContaining({
        WINDIE_PACKAGED_APP: '1',
        WINDIE_WAKEWORD_ALLOW_RUNTIME_DOWNLOAD: '0',
        PYTHONDONTWRITEBYTECODE: '1',
        PYTHONHOME: '/opt/WindieOS/resources/python-runtime',
        PYTHONNOUSERSITE: '1',
      }));
      expect(spawnOptions.env.PYTHONPATH).toBeUndefined();
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
