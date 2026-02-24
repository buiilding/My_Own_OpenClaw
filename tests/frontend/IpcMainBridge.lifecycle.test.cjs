/** @jest-environment node */

const {
  initIpc,
  primeQueryContext,
  registerBridgeSuiteLifecycleHooks,
} = require('./__mocks__/ipcMainBridgeHarness.cjs');

describe('ipc.cjs bridge lifecycle/config', () => {
  registerBridgeSuiteLifecycleHooks();

  test('sends handshake on websocket open with sanitized user_id', () => {
    const { ws } = initIpc();
    ws.triggerOpen();

    expect(ws.sent).toHaveLength(1);
    const handshake = JSON.parse(ws.sent[0]);
    expect(handshake.type).toBe('handshake');
    expect(handshake.user_id).toBe('bad_user_');
  });

  test('switches response overlay phase to tool-call when backend emits tool-call', () => {
    const onResponseOverlayPhaseChange = jest.fn();
    const { ws } = initIpc({ onResponseOverlayPhaseChange });
    ws.triggerOpen();

    ws.handlers.message(JSON.stringify({ type: 'tool-call', payload: {} }));

    expect(onResponseOverlayPhaseChange).toHaveBeenCalledWith({
      phase: 'tool-call',
      source: 'backend',
    });
  });

  test('switches response overlay phase back to awaiting-first-chunk after tool-output', () => {
    const onResponseOverlayPhaseChange = jest.fn();
    const { ws } = initIpc({ onResponseOverlayPhaseChange });
    ws.triggerOpen();

    ws.handlers.message(JSON.stringify({ type: 'tool-call', payload: {} }));
    ws.handlers.message(JSON.stringify({ type: 'tool-output', payload: {} }));

    expect(onResponseOverlayPhaseChange).toHaveBeenNthCalledWith(1, {
      phase: 'tool-call',
      source: 'backend',
    });
    expect(onResponseOverlayPhaseChange).toHaveBeenNthCalledWith(2, {
      phase: 'awaiting-first-chunk',
      source: 'backend',
    });
  });

  test('ignores malformed to-backend event payloads without crashing', async () => {
    const { handlers, ws } = initIpc();
    ws.triggerOpen();

    await handlers['to-backend']({ sender: null });

    expect(ws.sent).toHaveLength(1);
    const handshake = JSON.parse(ws.sent[0]);
    expect(handshake.type).toBe('handshake');
  });

  test('handles query events with missing payload object without throwing', async () => {
    const { handlers, ws, backendBridge } = initIpc();
    ws.triggerOpen();
    primeQueryContext(backendBridge);

    await handlers['to-backend']({ sender: null }, { type: 'query' });

    const queryMessage = JSON.parse(ws.sent[ws.sent.length - 1]);
    expect(queryMessage.type).toBe('query');
    expect(queryMessage.payload.content).toContain('<user_query>');
    expect(queryMessage.payload.content).toContain('</user_query>');
  });

  test('uses BACKEND_HOST and BACKEND_PORT for websocket + http endpoint metadata', async () => {
    process.env.BACKEND_HOST = '10.0.0.42';
    process.env.BACKEND_PORT = '9001';

    const { ws, handlers } = initIpc();
    expect(ws.url).toBe('ws://10.0.0.42:9001/ws');
    expect(ws.options).toEqual(expect.objectContaining({ origin: 'http://10.0.0.42:9001' }));

    const clientInfo = await handlers['get-client-user-id']();
    expect(clientInfo).toEqual(expect.objectContaining({
      backendWsUrl: 'ws://10.0.0.42:9001/ws',
      backendHttpUrl: 'http://10.0.0.42:9001',
    }));
  });

  test('derives websocket URL from BACKEND_HTTP_URL when explicit ws url is absent', async () => {
    process.env.BACKEND_HTTP_URL = 'https://windie.example.com/';

    const { ws, handlers } = initIpc();
    expect(ws.url).toBe('wss://windie.example.com/ws');
    expect(ws.options).toEqual(expect.objectContaining({ origin: 'https://windie.example.com' }));

    const clientInfo = await handlers['get-client-user-id']();
    expect(clientInfo).toEqual(expect.objectContaining({
      backendWsUrl: 'wss://windie.example.com/ws',
      backendHttpUrl: 'https://windie.example.com',
    }));
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
