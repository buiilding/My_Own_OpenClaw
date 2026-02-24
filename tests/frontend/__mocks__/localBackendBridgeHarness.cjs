const path = require('path');

jest.mock('child_process', () => ({
  spawn: jest.fn(),
}));

jest.mock('electron', () => ({
  ipcMain: {
    handle: jest.fn(),
  },
}));

jest.mock('uuid', () => ({
  v4: jest.fn(() => 'req-1'),
}));

jest.mock('fs', () => ({
  existsSync: jest.fn(() => true),
}));

const { createBridgeSuiteLifecycle } = require('./bridgeSuiteLifecycle.cjs');

const ORIGINAL_ENV = process.env;
const { registerBridgeSuiteLifecycleHooks } = createBridgeSuiteLifecycle({
  originalEnv: ORIGINAL_ENV,
  useRealTimersAfterEach: true,
});

let spawn;
let ipcMain;
let uuid;
let handlers;
let stdoutHandler;
let stderrHandler;
let processHandlers;
let pythonProcess;
let bridge;

function resetHarnessState() {
  jest.resetModules();
  handlers = {};
  stdoutHandler = null;
  stderrHandler = null;
  processHandlers = {};
}

function createMainWindow() {
  return {
    webContents: {
      send: jest.fn(),
    },
  };
}

function initializeBridgeHarness(configureSpawn) {
  resetHarnessState();
  spawn = require('child_process').spawn;
  ipcMain = require('electron').ipcMain;
  configureSpawn(spawn);
  ipcMain.handle.mockImplementation((channel, handler) => {
    handlers[channel] = handler;
  });

  bridge = require(path.join(__dirname, '../../../frontend/src/main/local_backend_bridge.cjs'));

  const mainWindow = createMainWindow();
  bridge.initializeLocalBackendBridge(mainWindow);
  return { mainWindow, bridge, handlers, spawn };
}

function createMockPythonProcess() {
  const procHandlers = {};
  const process = {
    stdin: { write: jest.fn() },
    stdout: {
      on: jest.fn((event, handler) => {
        if (event === 'data') {
          process._stdoutHandler = handler;
        }
      }),
    },
    stderr: { on: jest.fn() },
    on: jest.fn((event, handler) => {
      procHandlers[event] = handler;
    }),
    kill: jest.fn(),
    _handlers: procHandlers,
    _stdoutHandler: null,
  };
  return process;
}

function initBridge() {
  pythonProcess = {
    stdin: { write: jest.fn() },
    stdout: {
      on: jest.fn((event, handler) => {
        if (event === 'data') {
          stdoutHandler = handler;
        }
      }),
    },
    stderr: {
      on: jest.fn((event, handler) => {
        if (event === 'data') {
          stderrHandler = handler;
        }
      }),
    },
    on: jest.fn((event, handler) => {
      processHandlers[event] = handler;
    }),
    kill: jest.fn(),
  };

  const { mainWindow } = initializeBridgeHarness((spawnMock) => {
    spawnMock.mockReturnValue(pythonProcess);
  });
  uuid = require('uuid');

  return {
    mainWindow,
    bridge,
    handlers,
    pythonProcess,
    processHandlers,
    spawn,
    uuid,
    stdoutHandler: () => stdoutHandler,
    stderrHandler: () => stderrHandler,
  };
}

function initBridgeWithProcesses(processes) {
  const { mainWindow } = initializeBridgeHarness((spawnMock) => {
    spawnMock.mockReset();
    processes.forEach((proc) => {
      spawnMock.mockImplementationOnce(() => proc);
    });
  });

  return {
    mainWindow,
    bridge,
    handlers,
    spawn,
  };
}

function markReady() {
  emitReadiness(stdoutHandler);
}

function markProcessReady(process) {
  emitReadiness(process._stdoutHandler);
}

function emitReadiness(handler) {
  handler?.(
    Buffer.from(
      `${JSON.stringify({
        jsonrpc: '2.0',
        id: '__readiness_check_1__',
        result: { status: 'ok' },
      })}\n`,
    ),
  );
}

function getLastWrittenRequest() {
  const calls = pythonProcess.stdin.write.mock.calls;
  const lastCall = calls[calls.length - 1];
  return JSON.parse(lastCall[0].trim());
}

module.exports = {
  createMockPythonProcess,
  getLastWrittenRequest,
  initBridge,
  initBridgeWithProcesses,
  markProcessReady,
  markReady,
  registerBridgeSuiteLifecycleHooks,
};
