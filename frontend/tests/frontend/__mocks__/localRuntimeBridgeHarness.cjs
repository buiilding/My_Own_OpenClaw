/**
 * Covers local runtime bridge harness behavior in the frontend test suite.
 */

const path = require('path');

const mockAppendDiagnosticEvent = jest.fn(() => ({
  stored: true,
  traceId: 'diag-test',
  spanId: 'span-test',
}));

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

jest.mock('../../../src/main/diagnostics/app_diagnostics_store.cjs', () => ({
  APP_DIAGNOSTICS_PATH: 'conversation.metadata.list',
  BROWSER_SESSION_CONTROL_DIAGNOSTICS_PATH: 'browser.session_control',
  DESKTOP_STARTUP_DIAGNOSTICS_PATH: 'desktop.startup',
  RENDERER_INTERACTION_DIAGNOSTICS_PATH: 'renderer.interaction',
  IPC_BRIDGE_DIAGNOSTICS_PATH: 'ipc.bridge',
  LOCAL_RUNTIME_LIFECYCLE_DIAGNOSTICS_PATH: 'local_runtime.lifecycle',
  SURFACE_VISIBILITY_DIAGNOSTICS_PATH: 'surface.visibility',
  WAKEWORD_LIFECYCLE_DIAGNOSTICS_PATH: 'wakeword.lifecycle',
  appendDiagnosticEvent: (...args) => mockAppendDiagnosticEvent(...args),
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
let bridge;
let currentMainWindow;
let currentWindowState;
let sdkRuntime;
let ensureLocalRuntime;
let sdkRuntimeRequests;
let sdkRuntimeRequestHistory;
let queuedSdkRuntimeResponses;

function resetHarnessState() {
  jest.resetModules();
  mockAppendDiagnosticEvent.mockClear();
  handlers = {};
  currentWindowState = null;
  sdkRuntime = null;
  ensureLocalRuntime = null;
  sdkRuntimeRequests = [];
  sdkRuntimeRequestHistory = [];
  queuedSdkRuntimeResponses = [];
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
  if (typeof options.backendHttpUrl === 'string') {
    process.env.BACKEND_HTTP_URL = options.backendHttpUrl;
  }
  configureSpawn(spawn);
  ipcMain.handle.mockImplementation((channel, handler) => {
    handlers[channel] = handler;
  });

  bridge = require(path.join(__dirname, '../../../src/main/sidecar/local_runtime_bridge.cjs'));
  sdkRuntime = options.localRuntime || createMockSdkRuntime();
  ensureLocalRuntime = options.ensureLocalRuntime === undefined
    ? jest.fn(async () => sdkRuntime)
    : options.ensureLocalRuntime;

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
  bridge.initializeLocalRuntimeBridge(() => currentWindowState, {
    getArtifactUploadHeaders: options.getArtifactUploadHeaders,
    getKnownLocalRuntime: options.getKnownLocalRuntime,
    ensureLocalRuntime,
    isPackaged: options.isPackaged === true,
    permissionStatePath: options.permissionStatePath,
    authStatePath: options.authStatePath,
    localRuntimeBridgeCopy: options.localRuntimeBridgeCopy,
    sdkLocalToolExecutor: options.sdkLocalToolExecutor,
  });
  return {
    mainWindow,
    chatWindow,
    responseWindow,
    bridge,
    handlers,
    spawn,
    sdkRuntime,
    ensureLocalRuntime,
  };
}

function createMockSdkRuntime() {
  function trackRuntimeRequest(request) {
    sdkRuntimeRequestHistory.push(request);
    const queued = queuedSdkRuntimeResponses.shift();
    if (queued) {
      if (queued.error) {
        return Promise.reject(queued.error);
      }
      return Promise.resolve(queued.result);
    }
    return new Promise((resolve, reject) => {
      sdkRuntimeRequests.push({
        ...request,
        resolve,
        reject,
      });
    });
  }

  return {
    executeTool: jest.fn((payload) => trackRuntimeRequest({
        kind: 'executeTool',
        payload,
    })),
    rpc: jest.fn((request) => trackRuntimeRequest({
        kind: 'rpc',
        request,
    })),
    shutdown: jest.fn(async () => undefined),
    subscribeEvents: jest.fn(() => jest.fn()),
  };
}

function initBridge(options = {}) {
  const { mainWindow, chatWindow, responseWindow } = initializeBridgeHarness((spawnMock) => {
    spawnMock.mockImplementation(() => {
      throw new Error('Electron local runtime bridge must not spawn a standalone local runtime process.');
    });
  }, options);
  uuid = require('uuid');

  return {
    mainWindow,
    chatWindow,
    responseWindow,
    bridge,
    handlers,
    spawn,
    sdkRuntime,
    ensureLocalRuntime,
    uuid,
    stdoutHandler: () => null,
    stderrHandler: () => null,
  };
}

function markReady() {
  return null;
}

function getLastWrittenRequest() {
  const lastRequest = sdkRuntimeRequestHistory[sdkRuntimeRequestHistory.length - 1];
  if (!lastRequest) {
    return null;
  }
  if (lastRequest.kind === 'executeTool') {
    return {
      method: 'execute_tool',
      params: {
        tool_name: lastRequest.payload.toolName,
        args: lastRequest.payload.args,
      },
    };
  }
  return {
    method: lastRequest.request.method,
    params: lastRequest.request.params,
  };
}

function resolveNextSdkRuntimeRequest(result) {
  const nextRequest = sdkRuntimeRequests.shift();
  if (!nextRequest) {
    queuedSdkRuntimeResponses.push({ result });
    return;
  }
  nextRequest.resolve(result);
}

function rejectNextSdkRuntimeRequest(error) {
  const nextRequest = sdkRuntimeRequests.shift();
  if (!nextRequest) {
    queuedSdkRuntimeResponses.push({ error });
    return;
  }
  nextRequest.reject(error);
}

module.exports = {
  createWindow,
  getAppendDiagnosticEventMock: () => mockAppendDiagnosticEvent,
  getLastWrittenRequest,
  initBridge,
  markReady,
  rejectNextSdkRuntimeRequest,
  registerBridgeSuiteLifecycleHooks,
  resolveNextSdkRuntimeRequest,
};
