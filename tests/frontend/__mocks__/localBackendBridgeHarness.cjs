const path = require('path');

jest.mock('child_process', () => ({
  spawn: jest.fn(),
}));

jest.mock('electron', () => ({
  ipcMain: {
    handle: jest.fn(),
  },
  app: {
    isPackaged: false,
  },
  BrowserWindow: {
    fromWebContents: jest.fn(),
  },
  screen: {
    getAllDisplays: jest.fn(() => ([
      {
        id: 1,
        bounds: { x: 0, y: 0, width: 1920, height: 1080 },
        workArea: { x: 0, y: 0, width: 1920, height: 1040 },
      },
    ])),
    getPrimaryDisplay: jest.fn(() => ({
      id: 1,
      bounds: { x: 0, y: 0, width: 1920, height: 1080 },
      workArea: { x: 0, y: 0, width: 1920, height: 1040 },
    })),
    getDisplayMatching: jest.fn(() => ({
      id: 1,
      bounds: { x: 0, y: 0, width: 1920, height: 1080 },
      workArea: { x: 0, y: 0, width: 1920, height: 1040 },
    })),
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
let currentMainWindow;
let currentWindowState;

function resetHarnessState() {
  jest.resetModules();
  handlers = {};
  stdoutHandler = null;
  stderrHandler = null;
  processHandlers = {};
  currentWindowState = null;
}

function createMainWindow() {
  return {
    isDestroyed: jest.fn(() => false),
    isVisible: jest.fn(() => true),
    getBounds: jest.fn(() => ({ x: 0, y: 0, width: 1200, height: 800 })),
    webContents: {
      send: jest.fn(),
    },
  };
}

function createWindow(overrides = {}) {
  return {
    isDestroyed: jest.fn(() => false),
    isVisible: jest.fn(() => true),
    getBounds: jest.fn(() => ({ x: 0, y: 0, width: 1200, height: 800 })),
    webContents: {
      send: jest.fn(),
    },
    ...overrides,
  };
}

function initializeBridgeHarness(configureSpawn, options = {}) {
  resetHarnessState();
  spawn = require('child_process').spawn;
  const electron = require('electron');
  const fs = require('fs');
  ipcMain = electron.ipcMain;
  electron.app.isPackaged = options.isPackaged === true;
  if (typeof options.mockExistsSync === 'function') {
    fs.existsSync.mockImplementation(options.mockExistsSync);
  }
  configureSpawn(spawn);
  ipcMain.handle.mockImplementation((channel, handler) => {
    handlers[channel] = handler;
  });

  bridge = require(path.join(__dirname, '../../../frontend/src/main/local_backend_bridge.cjs'));

  const mainWindow = options.mainWindow || createMainWindow();
  const chatWindow = options.chatWindow || null;
  const responseWindow = options.responseWindow || null;
  currentMainWindow = mainWindow;
  currentWindowState = {
    mainWindow,
    chatWindow,
    responseWindow,
  };
  electron.BrowserWindow.fromWebContents.mockImplementation(() => currentMainWindow);
  bridge.initializeLocalBackendBridge(() => currentWindowState, {
    getFrontendConfig: () => options.frontendConfig || null,
    getArtifactUploadHeaders: options.getArtifactUploadHeaders,
    isPackaged: options.isPackaged === true,
  });
  return { mainWindow, chatWindow, responseWindow, bridge, handlers, spawn };
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

function initBridge(options = {}) {
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

  const { mainWindow, chatWindow, responseWindow } = initializeBridgeHarness((spawnMock) => {
    spawnMock.mockReturnValue(pythonProcess);
  }, options);
  uuid = require('uuid');

  return {
    mainWindow,
    chatWindow,
    responseWindow,
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

function initBridgeWithProcesses(processes, options = {}) {
  const { mainWindow, chatWindow, responseWindow } = initializeBridgeHarness((spawnMock) => {
    spawnMock.mockReset();
    processes.forEach((proc) => {
      spawnMock.mockImplementationOnce(() => proc);
    });
  }, options);

  return {
    mainWindow,
    chatWindow,
    responseWindow,
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
  createWindow,
  createMockPythonProcess,
  getLastWrittenRequest,
  initBridge,
  initBridgeWithProcesses,
  markProcessReady,
  markReady,
  registerBridgeSuiteLifecycleHooks,
};
