/**
 * Covers ipc bridge. behavior in the frontend test suite.
 */

import { IpcBridge } from '../../src/renderer/infrastructure/ipc/bridge';
import { INVOKE_CHANNELS, ON_CHANNELS, SEND_CHANNELS } from '../../src/renderer/infrastructure/ipc/channels';
import { clearMockIpc, installMockIpc } from './ipcBridge.testUtils';

describe('IpcBridge', () => {
  beforeEach(() => {
    installMockIpc();
  });

  afterEach(() => {
    clearMockIpc();
  });

  test('send forwards to window.ipc', () => {
    IpcBridge.send(SEND_CHANNELS.LIVE_SURFACE_TRACE, { event: 'typing.show' });
    expect((window as any).ipc.send).toHaveBeenCalledWith('live-surface-trace', { event: 'typing.show' });
  });

  test('invoke forwards to window.ipc and returns result', async () => {
    const result = await IpcBridge.invoke(INVOKE_CHANNELS.READ_ATTACHMENT_FILE, { filePath: '/tmp/a' });
    expect((window as any).ipc.invoke).toHaveBeenCalledWith('read-attachment-file', { filePath: '/tmp/a' });
    expect(result).toBe('ok');
  });

  test('on returns cleanup function', () => {
    const handler = jest.fn();
    const cleanupFn = jest.fn();
    (window as any).ipc.on.mockReturnValueOnce(cleanupFn);

    const cleanup = IpcBridge.on(ON_CHANNELS.BACKEND_SETTINGS_EVENT, handler);

    expect((window as any).ipc.on).toHaveBeenCalledWith('backend-settings-event', handler);
    expect(cleanup).toBe(cleanupFn);
  });

  test('once forwards to window.ipc', () => {
    const handler = jest.fn();
    IpcBridge.once(ON_CHANNELS.LOG, handler);
    expect((window as any).ipc.once).toHaveBeenCalledWith('log', handler);
  });

  test('throws when window.ipc is missing', async () => {
    clearMockIpc();
    await expect(IpcBridge.invoke(INVOKE_CHANNELS.READ_ATTACHMENT_FILE, {})).rejects.toThrow(
      'window.ipc is not available'
    );
  });

  test('send throws when window.ipc is missing', () => {
    clearMockIpc();
    expect(() => IpcBridge.send(SEND_CHANNELS.RENDERER_LOG, {})).toThrow(
      'window.ipc is not available',
    );
  });
});
