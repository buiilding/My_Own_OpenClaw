/** @jest-environment node */

const fs = require('node:fs');
const path = require('node:path');

const retiredDesktopAgentChannelGroupName = (group) => `DESKTOP_${'AGENT'}_${group}_CHANNELS`;

describe('preload IPC channel registry', () => {
  let exposedIpc;
  let exposedAgentSdkBridge;
  let exposedDesktopAgentBridge;
  let ipcRendererMock;
  let originalArgv;

  beforeEach(() => {
    jest.resetModules();
    exposedIpc = null;
    exposedAgentSdkBridge = null;
    exposedDesktopAgentBridge = null;
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
          if (key === 'agentSdk') {
            exposedAgentSdkBridge = value;
          }
          if (key === 'desktopAgent') {
            exposedDesktopAgentBridge = value;
          }
        }),
      },
      ipcRenderer: ipcRendererMock,
    }));

    const preloadChannels = {
      SEND_CHANNELS: {
        RENDERER_LOG: 'renderer-log',
        LIVE_SURFACE_TRACE: 'live-surface-trace',
      },
      INVOKE_CHANNELS: {
        DESKTOP_RUNTIME_INVOKE: 'windie:invoke',
        COPY_IMAGE_TO_CLIPBOARD: 'copy-image-to-clipboard',
        FETCH_ARTIFACT_IMAGE: 'fetch-artifact-image',
        SHOW_IMAGE_CONTEXT_MENU: 'show-image-context-menu',
      },
      ON_CHANNELS: {
        SETTINGS_UPDATED: 'settings-updated',
        DESKTOP_RUNTIME_MEMORY_STORE_CHANGED: 'windie:memory-store-changed',
        DESKTOP_RUNTIME_CONVERSATION_METADATA_INVALIDATED: 'windie:conversation-metadata-invalidated',
      },
    };
    process.argv = [
      '/path/to/electron',
      `--desktop-runtime-ipc-channels=${encodeURIComponent(JSON.stringify(preloadChannels))}`,
    ];

    require('../../src/preload.js');
  });

  afterEach(() => {
    process.argv = originalArgv;
    jest.dontMock('electron');
  });

  test('allows shared invoke channels from the central registry', async () => {
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

  test('exposes SDK-shaped command invoke over one IPC channel', async () => {
    await expect(exposedAgentSdkBridge.invoke('memories.clearAll', {})).resolves.toBe('ok');

    expect(ipcRendererMock.invoke).toHaveBeenCalledWith('windie:invoke', {
      command: 'memories.clearAll',
      payload: {},
    });
  });

  test('rejects invalid Agent SDK command names before IPC', async () => {
    await expect(exposedAgentSdkBridge.invoke('', { userId: 'user-1' })).rejects.toThrow(
      'Invalid Agent SDK command',
    );
    expect(ipcRendererMock.invoke).not.toHaveBeenCalledWith('windie:invoke', expect.anything());
  });

  test('does not expose removed browser-global command aliases', () => {
    expect(exposedAgentSdkBridge).toBeDefined();
    expect(exposedDesktopAgentBridge).toBeNull();
    expect(global.windie).toBeUndefined();
  });

  test('Agent SDK bridge uses the desktop-runtime invoke channel group internally', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../../src/preload.js'),
      'utf8',
    );
    const bridgeSource = source.slice(source.indexOf('const agentSdkCommandBridge'));

    expect(source).toContain('DESKTOP_RUNTIME_INVOKE_CHANNELS');
    expect(source).not.toContain(retiredDesktopAgentChannelGroupName('INVOKE'));
    expect(bridgeSource).toContain('DESKTOP_RUNTIME_INVOKE_CHANNELS.INVOKE');
    expect(bridgeSource).not.toContain('INVOKE_CHANNELS.WINDIE_INVOKE');
  });

  test('allows shared send channels from the central registry', () => {
    exposedIpc.send('renderer-log', {
      source: 'renderer-interaction',
      entry: { action: 'button_clicked' },
    });
    exposedIpc.send('live-surface-trace', {
      event: 'typing.show',
      view: 'minimal-chat-pill',
    });

    expect(ipcRendererMock.send).toHaveBeenCalledWith('renderer-log', {
      source: 'renderer-interaction',
      entry: { action: 'button_clicked' },
    });
    expect(ipcRendererMock.send).toHaveBeenCalledWith('live-surface-trace', {
      event: 'typing.show',
      view: 'minimal-chat-pill',
    });
  });

  test('rejects channels outside the shared invoke registry', async () => {
    await expect(exposedIpc.invoke('missing-channel', {})).rejects.toThrow(
      'Invalid invoke channel: missing-channel',
    );
  });

  test('does not expose memory SDK commands as direct IPC invokes', async () => {
    await expect(exposedIpc.invoke('clear-local-memory', { userId: 'user-1' })).rejects.toThrow(
      'Invalid invoke channel: clear-local-memory',
    );
    await expect(exposedIpc.invoke('list-episodic-memories', { userId: 'user-1' })).rejects.toThrow(
      'Invalid invoke channel: list-episodic-memories',
    );
    await expect(exposedAgentSdkBridge.invoke('memories.clearAll', {})).resolves.toBe('ok');
    expect(ipcRendererMock.invoke).toHaveBeenCalledWith('windie:invoke', {
      command: 'memories.clearAll',
      payload: {},
    });
  });

  test('does not expose chat clearing as a direct IPC invoke', async () => {
    await expect(exposedIpc.invoke('clear-chat-history', { userId: 'user-1' })).rejects.toThrow(
      'Invalid invoke channel: clear-chat-history',
    );
    await expect(exposedAgentSdkBridge.invoke('conversations.clearAll', { userId: 'user-1' })).resolves.toBe('ok');
    expect(ipcRendererMock.invoke).toHaveBeenCalledWith('windie:invoke', {
      command: 'conversations.clearAll',
      payload: { userId: 'user-1' },
    });
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

  test('allows memory store invalidation as a shared on-channel', () => {
    const handler = jest.fn();

    const cleanup = exposedIpc.on('windie:memory-store-changed', handler);

    expect(ipcRendererMock.on).toHaveBeenCalledWith(
      'windie:memory-store-changed',
      expect.any(Function),
    );

    cleanup();

    const [, subscription] = ipcRendererMock.on.mock.calls.at(-1);
    expect(ipcRendererMock.removeListener).toHaveBeenCalledWith(
      'windie:memory-store-changed',
      subscription,
    );
  });

  test('allows conversation metadata invalidation as a shared on-channel', () => {
    const handler = jest.fn();

    const cleanup = exposedIpc.on('windie:conversation-metadata-invalidated', handler);

    expect(ipcRendererMock.on).toHaveBeenCalledWith(
      'windie:conversation-metadata-invalidated',
      expect.any(Function),
    );

    cleanup();

    const [, subscription] = ipcRendererMock.on.mock.calls.at(-1);
    expect(ipcRendererMock.removeListener).toHaveBeenCalledWith(
      'windie:conversation-metadata-invalidated',
      subscription,
    );
  });

  test('loads channel data from the injected preload argument', () => {
    expect(process.argv).toEqual(
      expect.arrayContaining([
        expect.stringContaining('--desktop-runtime-ipc-channels='),
      ]),
    );
  });

  test('does not keep the removed preload argument alias', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../../src/preload.js'),
      'utf8',
    );

    expect(source).not.toContain('--desktop-' + 'agent-ipc-channels=');
  });
});
