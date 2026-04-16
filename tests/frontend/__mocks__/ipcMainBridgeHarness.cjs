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
}), { virtual: true });

jest.mock('uuid', () => ({
  v4: jest.fn(() => 'uuid-1'),
}), { virtual: true });

jest.mock('os', () => ({
  userInfo: jest.fn(() => ({ username: 'bad user!' })),
}));

jest.mock('fs', () => ({
  existsSync: jest.fn(() => false),
  promises: {
    readFile: jest.fn(),
    mkdir: jest.fn(),
    writeFile: jest.fn(),
    rename: jest.fn(),
  },
}));

jest.mock('../../../frontend/src/main/local_backend_bridge.cjs', () => ({
  getSystemState: jest.fn(),
  searchMemory: jest.fn(),
  storeMemory: jest.fn(),
}));

const { createBridgeSuiteLifecycle } = require('./bridgeSuiteLifecycle.cjs');

const ORIGINAL_ENV = process.env;

const {
  resetBackendEnv,
  restoreBackendEnv,
  silenceBridgeLogs,
} = createBridgeSuiteLifecycle({
  originalEnv: ORIGINAL_ENV,
});

const DEFAULT_SYSTEM_STATE = {
  active_window: 'App',
  mouse_position: '0,0',
};

const DEFAULT_MEMORY_RESULT = {
  success: true,
  data: { memories: { episodic: [], semantic: [] } },
};

let lastIpc = null;
let originalFetch = null;

function primeQueryContext(backendBridge, options = {}) {
  if (options.systemStateError) {
    backendBridge.getSystemState.mockRejectedValue(options.systemStateError);
  } else {
    backendBridge.getSystemState.mockResolvedValue(options.systemState ?? DEFAULT_SYSTEM_STATE);
  }

  if (options.memoryError) {
    backendBridge.searchMemory.mockRejectedValue(options.memoryError);
  } else {
    backendBridge.searchMemory.mockResolvedValue(options.memoryResult ?? DEFAULT_MEMORY_RESULT);
  }
}

function initIpc(options = {}) {
  jest.resetModules();

  const { ipcMain } = require('electron');
  const WebSocketMock = require('ws');
  const backendBridge = require('../../../frontend/src/main/local_backend_bridge.cjs');
  const fs = require('fs');

  if (originalFetch === null) {
    originalFetch = global.fetch;
  }
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
    '../../../frontend/src/main/ipc.cjs',
  ));
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
    global.fetch = originalFetch;
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
