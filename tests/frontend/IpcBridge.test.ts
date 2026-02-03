import { IpcBridge, INVOKE_CHANNELS, ON_CHANNELS, SEND_CHANNELS } from '../../frontend/src/renderer/infrastructure/ipc/bridge';

describe('IpcBridge', () => {
  beforeEach(() => {
    (window as any).ipc = {
      send: jest.fn(),
      invoke: jest.fn().mockResolvedValue('ok'),
      on: jest.fn().mockReturnValue(() => undefined),
      once: jest.fn(),
    };
  });

  afterEach(() => {
    delete (window as any).ipc;
  });

  test('send forwards to window.ipc', () => {
    IpcBridge.send(SEND_CHANNELS.TO_BACKEND, { hello: 'world' });
    expect((window as any).ipc.send).toHaveBeenCalledWith('to-backend', { hello: 'world' });
  });

  test('invoke forwards to window.ipc and returns result', async () => {
    const result = await IpcBridge.invoke(INVOKE_CHANNELS.EXECUTE_TOOL, { toolName: 'read_file' });
    expect((window as any).ipc.invoke).toHaveBeenCalledWith('execute-tool', { toolName: 'read_file' });
    expect(result).toBe('ok');
  });

  test('on returns cleanup function', () => {
    const cleanup = IpcBridge.on(ON_CHANNELS.FROM_BACKEND, jest.fn());
    expect(typeof cleanup).toBe('function');
    expect((window as any).ipc.on).toHaveBeenCalled();
  });

  test('once forwards to window.ipc', () => {
    const handler = jest.fn();
    IpcBridge.once(ON_CHANNELS.LOG, handler);
    expect((window as any).ipc.once).toHaveBeenCalledWith('log', handler);
  });

  test('throws when window.ipc is missing', async () => {
    delete (window as any).ipc;
    await expect(IpcBridge.invoke(INVOKE_CHANNELS.EXECUTE_TOOL, {})).rejects.toThrow(
      'window.ipc is not available'
    );
  });
});
