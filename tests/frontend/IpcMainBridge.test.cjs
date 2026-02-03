/** @jest-environment node */

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
});

jest.mock('electron', () => ({
  ipcMain: {
    handle: jest.fn(),
    on: jest.fn(),
  },
  BrowserWindow: jest.fn(),
  app: {
    getPath: jest.fn(() => '/tmp/appdata'),
  },
}));

jest.mock('uuid', () => ({
  v4: jest.fn(() => 'uuid-1'),
}));

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

jest.mock('../../frontend/src/main/local_backend_bridge.cjs', () => ({
  getSystemState: jest.fn(),
  searchMemory: jest.fn(),
}));

describe('ipc.cjs bridge', () => {
  const initIpc = () => {
    jest.resetModules();

    const { ipcMain } = require('electron');
    const WebSocketMock = require('ws');
    const backendBridge = require('../../frontend/src/main/local_backend_bridge.cjs');

    const handlers = {};
    ipcMain.handle.mockImplementation((channel, handler) => {
      handlers[channel] = handler;
    });
    ipcMain.on.mockImplementation((channel, handler) => {
      handlers[channel] = handler;
    });

    const ipc = require(path.join(
      __dirname,
      '../../frontend/src/main/ipc.cjs',
    ));

    const mainWindow = {
      webContents: { send: jest.fn() },
    };
    ipc.initializeIpc(mainWindow);

    const ws = WebSocketMock.instances[0];

    return { handlers, ws, backendBridge, mainWindow };
  };

  test('sends handshake on websocket open with sanitized user_id', () => {
    const { ws } = initIpc();
    ws.triggerOpen();

    expect(ws.sent).toHaveLength(1);
    const handshake = JSON.parse(ws.sent[0]);
    expect(handshake.type).toBe('handshake');
    expect(handshake.user_id).toBe('bad_user_');
  });

  test('builds full query payload with system state + memories', async () => {
    const { handlers, ws, backendBridge } = initIpc();
    ws.triggerOpen();

    backendBridge.getSystemState.mockResolvedValue({
      active_window: 'App',
      mouse_position: '0,0',
      screen_resolution: '1920x1080',
      windows: ['A', 'B'],
    });
    backendBridge.searchMemory.mockResolvedValue({
      success: true,
      data: { memories: { episodic: ['e1'], semantic: [] } },
    });

    await handlers['to-backend'](null, {
      type: 'query',
      payload: { text: 'hello' },
    });

    const lastMessage = JSON.parse(ws.sent[ws.sent.length - 1]);
    expect(lastMessage.type).toBe('query');
    expect(lastMessage.payload.content).toContain('<system_context>');
    expect(lastMessage.payload.content).toContain('<episodic_memory>');
    expect(lastMessage.payload.content).toContain('- e1');
    expect(lastMessage.payload.content).toContain('<semantic_memory>\nNone\n</semantic_memory>');
    expect(lastMessage.payload.content).toContain('<user_query>\nhello\n</user_query>');
  });

  test('load-frontend-config returns null when file missing', async () => {
    const { handlers } = initIpc();
    const result = await handlers['load-frontend-config']();
    expect(result).toBeNull();
  });
});
