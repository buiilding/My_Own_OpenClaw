/**
 * Covers ipc main bridge harness behavior in the frontend test suite.
 */

const path = require('path');

jest.mock('ws', () => {
  const instances = [];
  class WebSocketMock {
    constructor(url, options) {
      this.url = url;
      this.options = options;
      this.readyState = WebSocketMock.CONNECTING;
      this.handlers = {};
      this.sent = [];
      instances.push(this);
    }
    on(event, handler) {
      this.handlers[event] = handler;
    }
    send(data) {
      this.sent.push(data);
    }
    close() {
      this.readyState = WebSocketMock.CLOSED;
      if (this.handlers.close) {
        this.handlers.close();
      }
    }
    triggerOpen() {
      this.readyState = WebSocketMock.OPEN;
      if (this.handlers.open) {
        this.handlers.open();
      }
    }
  }
  WebSocketMock.instances = instances;
  WebSocketMock.CONNECTING = 0;
  WebSocketMock.OPEN = 1;
  WebSocketMock.CLOSED = 3;
  return WebSocketMock;
}, { virtual: true });

jest.mock('electron', () => ({
  ipcMain: {
    handle: jest.fn(),
    on: jest.fn(),
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
  app: {
    getPath: jest.fn(() => '/tmp/appdata'),
  },
  safeStorage: {
    isEncryptionAvailable: jest.fn(() => true),
    encryptString: jest.fn((value) => Buffer.from(`encrypted:${value}`, 'utf8')),
    decryptString: jest.fn((value) => value.toString('utf8').replace(/^encrypted:/, '')),
  },
}), { virtual: true });

jest.mock('uuid', () => ({
  v4: jest.fn(() => 'uuid-1'),
}), { virtual: true });

jest.mock('os', () => ({
  userInfo: jest.fn(() => ({ username: 'bad user!' })),
  tmpdir: jest.fn(() => '/tmp'),
}));

jest.mock('fs', () => ({
  existsSync: jest.fn(() => false),
  readFileSync: jest.fn(),
  promises: {
    readFile: jest.fn(),
    mkdir: jest.fn(),
    rm: jest.fn(),
    chmod: jest.fn(),
    writeFile: jest.fn(),
    rename: jest.fn(),
    rm: jest.fn(),
  },
}));

jest.mock('../../../src/main/sidecar/local_runtime_bridge.cjs', () => ({
  executeToolForBackend: jest.fn(),
}));

const { createBridgeSuiteLifecycle } = require('./bridgeSuiteLifecycle.cjs');

const ORIGINAL_ENV = process.env;
const ORIGINAL_FETCH = global.fetch;

const {
  resetBackendEnv,
  restoreBackendEnv,
  silenceBridgeLogs,
} = createBridgeSuiteLifecycle({
  originalEnv: ORIGINAL_ENV,
});

let lastIpc = null;

function primeQueryContext(backendBridge) {
  backendBridge.executeToolForBackend.mockResolvedValue({
    success: true,
    data: {
      output: 'tool ok',
      output: 'tool ok',
    },
  });

}

function initIpc(options = {}) {
  jest.resetModules();

  const { ipcMain } = require('electron');
  const WebSocketMock = require('ws');
  const backendBridge = require('../../../src/main/sidecar/local_runtime_bridge.cjs');
  const fs = require('fs');

  backendBridge.executeToolForBackend.mockResolvedValue({
    success: true,
    data: {
      output: 'tool ok',
      output: 'tool ok',
    },
  });

  global.fetch = jest.fn(async (url) => {
    if (typeof url === 'string' && url.includes('/api/install/register')) {
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            user_id: 'registered-user-1',
            install_id: 'install-1',
            install_token: 'install-token-1',
          };
        },
        async text() {
          return '';
        },
      };
    }
    if (typeof url === 'string' && url.includes('/api/install/me')) {
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            user_id: 'registered-user-1',
            install_id: 'install-1',
          };
        },
        async text() {
          return '';
        },
      };
    }
    throw new Error(`Unexpected fetch call in ipc harness: ${url}`);
  });

  const handlers = {};
  ipcMain.handle.mockImplementation((channel, handler) => {
    handlers[channel] = handler;
  });
  ipcMain.on.mockImplementation((channel, handler) => {
    handlers[channel] = handler;
  });

  const ipc = require(path.join(
    __dirname,
    '../../../src/main/ipc.cjs',
  ));
  const { mainHostSkin } = require('../../../src/main/app/main_host_skin.cjs');
  ipc.configureIpcHostRuntime({
    hostedBackend: mainHostSkin.hostedBackend,
    debug: mainHostSkin.debug,
  });
  ipc.configureIpcHostCopyRuntime({
    identity: mainHostSkin.identity,
    queryEvents: options.queryEvents || mainHostSkin.queryEvents,
  });
  lastIpc = ipc;

  const mainWindow = {
    on: jest.fn(),
    isDestroyed: jest.fn(() => false),
    isVisible: jest.fn(() => true),
    getBounds: jest.fn(() => ({ x: 0, y: 0, width: 1200, height: 800 })),
    webContents: { send: jest.fn() },
  };
  const chatWindow = options.chatWindow || null;
  ipc.initializeIpc(mainWindow, {
    ...options,
    WebSocketImpl: WebSocketMock,
    getWindows: options.getWindows || (() => ({
      mainWindow,
      chatWindow,
    })),
  });

  const getWs = () => WebSocketMock.instances[WebSocketMock.instances.length - 1] || null;
  const ws = getWs();

  return { handlers, ws, getWs, backendBridge, mainWindow, chatWindow, fs, ipc };
}

function registerIpcBridgeSuiteLifecycleHooks() {
  beforeEach(() => {
    resetBackendEnv();
    silenceBridgeLogs();
  });

  afterEach(() => {
    lastIpc?.shutdownIpcForTests?.();
    lastIpc = null;
    const WebSocketMock = require('ws');
    WebSocketMock.instances.length = 0;
    global.fetch = ORIGINAL_FETCH;
    jest.restoreAllMocks();
  });

  afterAll(() => {
    restoreBackendEnv();
  });
}

module.exports = {
  initIpc,
  primeQueryContext,
  registerBridgeSuiteLifecycleHooks: registerIpcBridgeSuiteLifecycleHooks,
  resetBackendEnv,
  restoreBackendEnv,
  silenceBridgeLogs,
};
