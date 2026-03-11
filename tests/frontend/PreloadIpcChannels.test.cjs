/** @jest-environment node */

describe('preload IPC channel registry', () => {
  let exposedIpc;
  let ipcRendererMock;

  beforeEach(() => {
    jest.resetModules();
    exposedIpc = null;
    ipcRendererMock = {
      send: jest.fn(),
      invoke: jest.fn(async () => 'ok'),
      on: jest.fn(),
      once: jest.fn(),
      removeListener: jest.fn(),
    };

    jest.doMock('electron', () => ({
      contextBridge: {
        exposeInMainWorld: jest.fn((key, value) => {
          if (key === 'ipc') {
            exposedIpc = value;
          }
        }),
      },
      ipcRenderer: ipcRendererMock,
    }));

    require('../../frontend/src/preload.js');
  });

  afterEach(() => {
    jest.dontMock('electron');
  });

  test('allows shared invoke channels from the central registry', async () => {
    await expect(exposedIpc.invoke('clear-chat-history', { userId: 'user-1' })).resolves.toBe('ok');
    expect(ipcRendererMock.invoke).toHaveBeenCalledWith('clear-chat-history', { userId: 'user-1' });

    await expect(exposedIpc.invoke('clear-local-memory', { userId: 'user-1' })).resolves.toBe('ok');
    expect(ipcRendererMock.invoke).toHaveBeenCalledWith('clear-local-memory', { userId: 'user-1' });
  });

  test('rejects channels outside the shared invoke registry', async () => {
    await expect(exposedIpc.invoke('missing-channel', {})).rejects.toThrow(
      'Invalid invoke channel: missing-channel',
    );
  });
});
