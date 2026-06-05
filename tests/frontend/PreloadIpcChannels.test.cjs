/** @jest-environment node */

describe('preload IPC channel registry', () => {
  let exposedIpc;
  let exposedWindie;
  let ipcRendererMock;
  let originalArgv;

  beforeEach(() => {
    jest.resetModules();
    exposedIpc = null;
    exposedWindie = null;
    originalArgv = process.argv;
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
          if (key === 'windie') {
            exposedWindie = value;
          }
        }),
      },
      ipcRenderer: ipcRendererMock,
    }));

    const preloadChannels = {
      SEND_CHANNELS: {
        RENDERER_LOG: 'renderer-log',
      },
      INVOKE_CHANNELS: {
        WINDIE_INVOKE: 'windie:invoke',
        CLEAR_CHAT_HISTORY: 'clear-chat-history',
        CLEAR_LOCAL_MEMORY: 'clear-local-memory',
        COPY_IMAGE_TO_CLIPBOARD: 'copy-image-to-clipboard',
        FETCH_ARTIFACT_IMAGE: 'fetch-artifact-image',
        SHOW_IMAGE_CONTEXT_MENU: 'show-image-context-menu',
      },
      ON_CHANNELS: {
        SETTINGS_UPDATED: 'settings-updated',
      },
    };
    process.argv = [
      '/path/to/electron',
      `--windie-ipc-channels=${encodeURIComponent(JSON.stringify(preloadChannels))}`,
    ];

    require('../../frontend/src/preload.js');
  });

  afterEach(() => {
    process.argv = originalArgv;
    jest.dontMock('electron');
  });

  test('allows shared invoke channels from the central registry', async () => {
    await expect(exposedIpc.invoke('clear-chat-history', { userId: 'user-1' })).resolves.toBe('ok');
    expect(ipcRendererMock.invoke).toHaveBeenCalledWith('clear-chat-history', { userId: 'user-1' });

    await expect(exposedIpc.invoke('clear-local-memory', { userId: 'user-1' })).resolves.toBe('ok');
    expect(ipcRendererMock.invoke).toHaveBeenCalledWith('clear-local-memory', { userId: 'user-1' });

    await expect(exposedIpc.invoke('copy-image-to-clipboard', { src: 'data:image/png;base64,abc' })).resolves.toBe('ok');
    expect(ipcRendererMock.invoke).toHaveBeenCalledWith('copy-image-to-clipboard', {
      src: 'data:image/png;base64,abc',
    });

    await expect(exposedIpc.invoke('fetch-artifact-image', { artifactId: 'artifact-1' })).resolves.toBe('ok');
    expect(ipcRendererMock.invoke).toHaveBeenCalledWith('fetch-artifact-image', {
      artifactId: 'artifact-1',
    });

    await expect(exposedIpc.invoke('show-image-context-menu', { src: 'https://cdn.example/screenshot.png' })).resolves.toBe('ok');
    expect(ipcRendererMock.invoke).toHaveBeenCalledWith('show-image-context-menu', {
      src: 'https://cdn.example/screenshot.png',
    });
  });

  test('exposes SDK-shaped Windie command invoke over one IPC channel', async () => {
    await expect(exposedWindie.invoke('memories.clearAll', { userId: 'user-1' })).resolves.toBe('ok');

    expect(ipcRendererMock.invoke).toHaveBeenCalledWith('windie:invoke', {
      command: 'memories.clearAll',
      payload: { userId: 'user-1' },
    });
  });

  test('rejects invalid Windie command names before IPC', async () => {
    await expect(exposedWindie.invoke('', { userId: 'user-1' })).rejects.toThrow(
      'Invalid Windie SDK command',
    );
    expect(ipcRendererMock.invoke).not.toHaveBeenCalledWith('windie:invoke', expect.anything());
  });

  test('allows shared send channels from the central registry', () => {
    exposedIpc.send('renderer-log', {
      source: 'frontend-interaction',
      entry: { action: 'button_clicked' },
    });

    expect(ipcRendererMock.send).toHaveBeenCalledWith('renderer-log', {
      source: 'frontend-interaction',
      entry: { action: 'button_clicked' },
    });
  });

  test('rejects channels outside the shared invoke registry', async () => {
    await expect(exposedIpc.invoke('missing-channel', {})).rejects.toThrow(
      'Invalid invoke channel: missing-channel',
    );
  });

  test('throws for channels outside the shared send registry', () => {
    expect(() => exposedIpc.send('missing-channel', {})).toThrow(
      'Invalid send channel: missing-channel',
    );
    expect(ipcRendererMock.send).not.toHaveBeenCalledWith('missing-channel', {});
  });

  test('returns cleanup for one-time listeners before they fire', () => {
    const handler = jest.fn();

    const cleanup = exposedIpc.once('settings-updated', handler);

    expect(ipcRendererMock.once).toHaveBeenCalledTimes(1);
    const [channel, subscription] = ipcRendererMock.once.mock.calls[0];
    expect(channel).toBe('settings-updated');
    expect(typeof subscription).toBe('function');

    cleanup();

    expect(ipcRendererMock.removeListener).toHaveBeenCalledWith(
      'settings-updated',
      subscription,
    );
  });

  test('loads channel data from the injected preload argument', () => {
    expect(process.argv).toEqual(
      expect.arrayContaining([
        expect.stringContaining('--windie-ipc-channels='),
      ]),
    );
  });
});
