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
  BrowserWindow: jest.fn(),
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
}));

const { createBridgeSuiteLifecycle } = require('./bridgeSuiteLifecycle.cjs');

const ORIGINAL_ENV = process.env;

const {
  resetBackendEnv,
  restoreBackendEnv,
  silenceBridgeLogs,
  registerBridgeSuiteLifecycleHooks,
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

  const mainWindow = {
    on: jest.fn(),
    isDestroyed: jest.fn(() => false),
    webContents: { send: jest.fn() },
  };
  ipc.initializeIpc(mainWindow, options);

  const ws = WebSocketMock.instances[0];

  return { handlers, ws, backendBridge, mainWindow, fs };
}

module.exports = {
  initIpc,
  primeQueryContext,
  registerBridgeSuiteLifecycleHooks,
  resetBackendEnv,
  restoreBackendEnv,
  silenceBridgeLogs,
};
