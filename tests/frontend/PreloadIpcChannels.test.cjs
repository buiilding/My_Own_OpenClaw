/** @jest-environment node */

describe('preload IPC channel registry', () => {
  let exposedIpc;
  let ipcRendererMock;
  let originalArgv;

  beforeEach(() => {
    jest.resetModules();
    exposedIpc = null;
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
        }),
      },
      ipcRenderer: ipcRendererMock,
    }));

    process.argv = [
      '/path/to/electron',
      '--windie-ipc-channels=%7B%22SEND_CHANNELS%22%3A%7B%7D%2C%22INVOKE_CHANNELS%22%3A%7B%22CLEAR_CHAT_HISTORY%22%3A%22clear-chat-history%22%2C%22CLEAR_LOCAL_MEMORY%22%3A%22clear-local-memory%22%2C%22COPY_IMAGE_TO_CLIPBOARD%22%3A%22copy-image-to-clipboard%22%2C%22FETCH_ARTIFACT_IMAGE%22%3A%22fetch-artifact-image%22%2C%22SHOW_IMAGE_CONTEXT_MENU%22%3A%22show-image-context-menu%22%7D%2C%22ON_CHANNELS%22%3A%7B%7D%7D',
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

  test('rejects channels outside the shared invoke registry', async () => {
    await expect(exposedIpc.invoke('missing-channel', {})).rejects.toThrow(
      'Invalid invoke channel: missing-channel',
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
