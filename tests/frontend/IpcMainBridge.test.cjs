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
      '../../frontend/src/main/ipc.cjs',
    ));

    const mainWindow = {
      on: jest.fn(),
      isDestroyed: jest.fn(() => false),
      webContents: { send: jest.fn() },
    };
    ipc.initializeIpc(mainWindow);

    const ws = WebSocketMock.instances[0];

    return { handlers, ws, backendBridge, mainWindow, fs };
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

    await handlers['to-backend']({ sender: null }, {
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

  test('builds query with fallback system context on system state error', async () => {
    const { handlers, ws, backendBridge } = initIpc();
    ws.triggerOpen();

    backendBridge.getSystemState.mockRejectedValue(new Error('boom'));
    backendBridge.searchMemory.mockResolvedValue({
      success: true,
      data: { memories: { episodic: [], semantic: [] } },
    });

    await handlers['to-backend']({ sender: null }, {
      type: 'query',
      payload: { text: 'hi' },
    });

    const lastMessage = JSON.parse(ws.sent[ws.sent.length - 1]);
    expect(lastMessage.payload.content).toContain('<active_window>Unknown</active_window>');
    expect(lastMessage.payload.content).toContain('<episodic_memory>\nNone\n</episodic_memory>');
    expect(lastMessage.payload.content).toContain('<semantic_memory>\nNone\n</semantic_memory>');
  });

  test('builds query with empty memories when search fails', async () => {
    const { handlers, ws, backendBridge } = initIpc();
    ws.triggerOpen();

    backendBridge.getSystemState.mockResolvedValue({
      active_window: 'App',
      mouse_position: '0,0',
    });
    backendBridge.searchMemory.mockRejectedValue(new Error('fail'));

    await handlers['to-backend']({ sender: null }, {
      type: 'query',
      payload: { text: 'memory fail' },
    });

    const lastMessage = JSON.parse(ws.sent[ws.sent.length - 1]);
    expect(lastMessage.payload.content).toContain('<episodic_memory>\nNone\n</episodic_memory>');
    expect(lastMessage.payload.content).toContain('<semantic_memory>\nNone\n</semantic_memory>');
    expect(lastMessage.payload.content).toContain('<user_query>\nmemory fail\n</user_query>');
  });

  test('gates first query behind settings-updated ack when frontend config exists', async () => {
    const { handlers, ws, backendBridge, fs } = initIpc();
    fs.existsSync.mockReturnValue(true);
    fs.promises.readFile.mockResolvedValue(JSON.stringify({
      interaction_mode: 'agent',
      model_mode: 'online',
    }));
    ws.triggerOpen();

    backendBridge.getSystemState.mockResolvedValue({
      active_window: 'App',
      mouse_position: '0,0',
    });
    backendBridge.searchMemory.mockResolvedValue({
      success: true,
      data: { memories: { episodic: [], semantic: [] } },
    });

    const queryPromise = handlers['to-backend']({ sender: null }, {
      type: 'query',
      payload: { text: 'mode check' },
    });

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(ws.sent.length).toBe(2);
    const settingsMessage = JSON.parse(ws.sent[1]);
    expect(settingsMessage.type).toBe('update-settings');
    expect(settingsMessage.payload).toEqual(expect.objectContaining({
      interaction_mode: 'agent',
    }));

    ws.handlers.message(JSON.stringify({
      type: 'settings-updated',
      id: settingsMessage.id,
      payload: { updated_keys: ['interaction_mode'] },
    }));

    await queryPromise;

    const queryMessage = JSON.parse(ws.sent[ws.sent.length - 1]);
    expect(queryMessage.type).toBe('query');
    expect(queryMessage.payload.content).toContain('<user_query>\nmode check\n</user_query>');
  });

  test('waits for pending renderer update-settings ack before sending query', async () => {
    const { handlers, ws, backendBridge } = initIpc();
    ws.triggerOpen();

    backendBridge.getSystemState.mockResolvedValue({
      active_window: 'App',
      mouse_position: '0,0',
    });
    backendBridge.searchMemory.mockResolvedValue({
      success: true,
      data: { memories: { episodic: [], semantic: [] } },
    });

    await handlers['to-backend']({ sender: null }, {
      type: 'update-settings',
      payload: { interaction_mode: 'agent' },
    });

    const updateSettingsMessage = JSON.parse(ws.sent[1]);
    expect(updateSettingsMessage.type).toBe('update-settings');

    const queryPromise = handlers['to-backend']({ sender: null }, {
      type: 'query',
      payload: { text: 'after settings update' },
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(JSON.parse(ws.sent[ws.sent.length - 1]).type).toBe('update-settings');

    ws.handlers.message(JSON.stringify({
      type: 'settings-updated',
      id: updateSettingsMessage.id,
      payload: { updated_keys: ['interaction_mode'] },
    }));

    await queryPromise;

    const queryMessage = JSON.parse(ws.sent[ws.sent.length - 1]);
    expect(queryMessage.type).toBe('query');
    expect(queryMessage.payload.content).toContain('<user_query>\nafter settings update\n</user_query>');
  });

  test('load-frontend-config returns null when file missing', async () => {
    const { handlers } = initIpc();
    const result = await handlers['load-frontend-config']();
    expect(result).toBeNull();
  });

  test('load-frontend-config returns parsed config when file exists', async () => {
    const { handlers, fs } = initIpc();
    fs.existsSync.mockReturnValue(true);
    fs.promises.readFile.mockResolvedValue('{"model_mode":"offline"}');

    const result = await handlers['load-frontend-config']();

    expect(result).toEqual({ model_mode: 'offline' });
  });

  test('load-frontend-config returns null for invalid JSON', async () => {
    const { handlers, fs } = initIpc();
    fs.existsSync.mockReturnValue(true);
    fs.promises.readFile.mockResolvedValue('{bad json');

    const result = await handlers['load-frontend-config']();

    expect(result).toBeNull();
  });

  test('load-frontend-config returns null for non-object payload', async () => {
    const { handlers, fs } = initIpc();
    fs.existsSync.mockReturnValue(true);
    fs.promises.readFile.mockResolvedValue('[]');

    const result = await handlers['load-frontend-config']();

    expect(result).toBeNull();
  });

  test('save-frontend-config rejects invalid payload', async () => {
    const { handlers, fs } = initIpc();

    const result = await handlers['save-frontend-config'](null, null);

    expect(result).toEqual({ success: false, error: 'Invalid config payload' });
    expect(fs.promises.writeFile).not.toHaveBeenCalled();
  });

  test('save-frontend-config writes file and renames temp path', async () => {
    const { handlers, fs } = initIpc();

    const result = await handlers['save-frontend-config'](null, { model_mode: 'online' });

    expect(result).toEqual({ success: true });
    expect(fs.promises.mkdir).toHaveBeenCalledWith('/tmp/appdata', { recursive: true });
    expect(fs.promises.writeFile).toHaveBeenCalledWith(
      '/tmp/appdata/frontend-config.json.tmp',
      JSON.stringify({ model_mode: 'online' }, null, 2),
      'utf-8',
    );
    expect(fs.promises.rename).toHaveBeenCalledWith(
      '/tmp/appdata/frontend-config.json.tmp',
      '/tmp/appdata/frontend-config.json',
    );
  });
});
