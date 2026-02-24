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

const ORIGINAL_ENV = process.env;
let spawn;
let ipcMain;
let uuid;
let handlers;
let stdoutHandler;
let stderrHandler;
let processHandlers;
let pythonProcess;
let bridge;

function resetBackendEnv() {
  process.env = { ...ORIGINAL_ENV };
  delete process.env.BACKEND_HOST;
  delete process.env.BACKEND_PORT;
  delete process.env.BACKEND_HTTP_URL;
  delete process.env.BACKEND_WS_URL;
}

function restoreBackendEnv() {
  process.env = ORIGINAL_ENV;
}

function silenceBridgeLogs() {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
}

function registerBridgeSuiteLifecycleHooks() {
  beforeEach(() => {
    resetBackendEnv();
    silenceBridgeLogs();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  afterAll(() => {
    restoreBackendEnv();
  });
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
  jest.resetModules();
  handlers = {};
  stdoutHandler = null;
  stderrHandler = null;
  processHandlers = {};

  spawn = require('child_process').spawn;
  ipcMain = require('electron').ipcMain;
  uuid = require('uuid');

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

  spawn.mockReturnValue(pythonProcess);
  ipcMain.handle.mockImplementation((channel, handler) => {
    handlers[channel] = handler;
  });

  bridge = require(path.join(__dirname, '../../../frontend/src/main/local_backend_bridge.cjs'));

  const mainWindow = {
    webContents: {
      send: jest.fn(),
    },
  };

  bridge.initializeLocalBackendBridge(mainWindow);

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
  jest.resetModules();
  handlers = {};
  stdoutHandler = null;
  stderrHandler = null;
  processHandlers = {};

  spawn = require('child_process').spawn;
  ipcMain = require('electron').ipcMain;

  spawn.mockReset();
  processes.forEach((proc) => {
    spawn.mockImplementationOnce(() => proc);
  });

  ipcMain.handle.mockImplementation((channel, handler) => {
    handlers[channel] = handler;
  });

  bridge = require(path.join(__dirname, '../../../frontend/src/main/local_backend_bridge.cjs'));

  const mainWindow = {
    webContents: {
      send: jest.fn(),
    },
  };

  bridge.initializeLocalBackendBridge(mainWindow);

  return {
    mainWindow,
    bridge,
    handlers,
    spawn,
  };
}

function markReady() {
  stdoutHandler(
    Buffer.from(
      `${JSON.stringify({
        jsonrpc: '2.0',
        id: '__readiness_check_1__',
        result: { status: 'ok' },
      })}\n`,
    ),
  );
}

function markProcessReady(process) {
  process._stdoutHandler?.(
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
