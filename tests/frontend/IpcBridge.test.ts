import { IpcBridge, INVOKE_CHANNELS, ON_CHANNELS, SEND_CHANNELS } from '../../frontend/src/renderer/infrastructure/ipc/bridge';
import { clearMockIpc, installMockIpc } from './ipcBridge.testUtils';

describe('IpcBridge', () => {
  beforeEach(() => {
    installMockIpc();
  });

  afterEach(() => {
    clearMockIpc();
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
    const handler = jest.fn();
    const cleanupFn = jest.fn();
    (window as any).ipc.on.mockReturnValueOnce(cleanupFn);

    const cleanup = IpcBridge.on(ON_CHANNELS.FROM_BACKEND, handler);

    expect((window as any).ipc.on).toHaveBeenCalledWith('from-backend', handler);
    expect(cleanup).toBe(cleanupFn);
  });

  test('once forwards to window.ipc', () => {
    const handler = jest.fn();
    IpcBridge.once(ON_CHANNELS.LOG, handler);
    expect((window as any).ipc.once).toHaveBeenCalledWith('log', handler);
  });

  test('throws when window.ipc is missing', async () => {
    clearMockIpc();
    await expect(IpcBridge.invoke(INVOKE_CHANNELS.EXECUTE_TOOL, {})).rejects.toThrow(
      'window.ipc is not available'
    );
  });

  test('send throws when window.ipc is missing', () => {
    clearMockIpc();
    expect(() => IpcBridge.send(SEND_CHANNELS.TO_BACKEND, {})).toThrow(
      'window.ipc is not available',
    );
  });
});
