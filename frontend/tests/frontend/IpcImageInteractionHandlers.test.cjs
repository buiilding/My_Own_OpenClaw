/** @jest-environment node */

const fs = require('fs/promises');
const path = require('path');
const {
  createImageInteractionHandlersRuntime,
} = require('../../src/main/ipc/ipc_image_interaction_handlers.cjs');
const imageInteractionHandlersModule = require('../../src/main/ipc/ipc_image_interaction_handlers.cjs');

function imageResponse({
  status = 200,
  contentType = 'image/png',
  bytes = [137, 80, 78, 71],
} = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: jest.fn((name) => {
        const normalizedName = String(name).toLowerCase();
        if (normalizedName === 'content-type') {
          return contentType;
        }
        return null;
      }),
    },
    arrayBuffer: async () => Uint8Array.from(bytes).buffer,
  };
}

function createIpcMainHarness() {
  const invokeHandlers = {};
  const ipcMain = {
    handle: jest.fn((channel, handler) => {
      invokeHandlers[channel] = handler;
    }),
  };
  return {
    ipcMain,
    invokeHandlers,
  };
}

describe('ipc image interaction handlers', () => {
  test('registers clipboard and context menu IPC handlers with the same trusted origin policy', async () => {
    const { ipcMain, invokeHandlers } = createIpcMainHarness();
    const popup = jest.fn();
    const contextMenuEntries = [];
    const Menu = {};
    Menu.buildFromTemplate = jest.fn((entries) => {
      contextMenuEntries.push(...entries);
      return { popup };
    });
    const BrowserWindow = {};
    const clipboard = {
      writeImage: jest.fn(),
    };
    const decodedImage = {
      isEmpty: jest.fn(() => false),
    };
    const nativeImage = {
      createFromDataURL: jest.fn(() => decodedImage),
      createFromBuffer: jest.fn(() => decodedImage),
    };
    const fetchImpl = jest.fn().mockResolvedValue(imageResponse());

    const runtime = createImageInteractionHandlersRuntime({
      Menu,
      BrowserWindow,
      clipboard,
      nativeImage,
      fetchImpl,
          getBackendHttpUrl: () => 'https://backend.example.com',
          getBackendCandidates: () => [
            { httpUrl: 'https://candidate-a.backend.example.com' },
          ],
        });

    runtime.register({ ipcMain });

    expect(ipcMain.handle).toHaveBeenCalledWith(
      'copy-image-to-clipboard',
      expect.any(Function),
    );
    expect(ipcMain.handle).toHaveBeenCalledWith(
      'show-image-context-menu',
      expect.any(Function),
    );

        await expect(invokeHandlers['copy-image-to-clipboard'](null, {
          src: 'https://candidate-a.backend.example.com/api/artifacts/image.png',
        })).resolves.toEqual({ success: true });
        expect(fetchImpl).toHaveBeenCalledWith(
          'https://candidate-a.backend.example.com/api/artifacts/image.png',
          { redirect: 'manual' },
        );

    await expect(invokeHandlers['copy-image-to-clipboard'](null, {
      src: 'https://backend.example.com/api/artifacts/image.png',
    })).resolves.toEqual({ success: true });
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://backend.example.com/api/artifacts/image.png',
      { redirect: 'manual' },
    );

    await expect(invokeHandlers['show-image-context-menu']({ sender: {} }, {
      src: 'data:image/png;base64,abc123',
    })).resolves.toEqual({ success: true });
    await contextMenuEntries[0].click();
    expect(nativeImage.createFromDataURL).toHaveBeenCalledWith('data:image/png;base64,abc123');
    expect(clipboard.writeImage).toHaveBeenCalledWith(decodedImage);
  });

  test('runtime returns structured failures from image IPC handlers', async () => {
    const { ipcMain, invokeHandlers } = createIpcMainHarness();
    const runtime = createImageInteractionHandlersRuntime({
      Menu: null,
      BrowserWindow: null,
      clipboard: { writeImage: jest.fn() },
      nativeImage: {
        createFromDataURL: jest.fn(() => ({
          isEmpty: jest.fn(() => true),
        })),
      },
    });

    runtime.register({ ipcMain });

    await expect(invokeHandlers['copy-image-to-clipboard'](null, {
      src: 'data:image/png;base64,broken',
    })).resolves.toEqual({
      success: false,
      error: 'Failed to decode image for clipboard copy.',
    });

    await expect(invokeHandlers['show-image-context-menu'](null, {
      src: 'https://cdn.example/screenshot.png',
    })).resolves.toEqual({
      success: false,
      error: 'Native menu support is unavailable.',
    });
  });

  test('runtime registers image handlers with injected Electron and backend dependencies', () => {
    const { ipcMain, invokeHandlers } = createIpcMainHarness();
    const Menu = {};
    const BrowserWindow = {};
    const clipboard = {};
    const nativeImage = {};
    const runtime = createImageInteractionHandlersRuntime({
      Menu,
      BrowserWindow,
      clipboard,
      nativeImage,
      getBackendHttpUrl: () => 'https://runtime.backend.example.test',
      getBackendCandidates: () => [
        { httpUrl: 'https://candidate.backend.example.test' },
      ],
    });

    runtime.register({ ipcMain });

    expect(invokeHandlers['copy-image-to-clipboard']).toEqual(expect.any(Function));
    expect(invokeHandlers['show-image-context-menu']).toEqual(expect.any(Function));
  });

  test('ipc.cjs delegates image IPC registration through the image interaction helper', async () => {
    const mainSource = await fs.readFile(
      path.resolve(__dirname, '../../src/main/ipc.cjs'),
      'utf8',
    );
    const helperSource = await fs.readFile(
      path.resolve(__dirname, '../../src/main/ipc/ipc_image_interaction_handlers.cjs'),
      'utf8',
    );
    const initializationSource = await fs.readFile(
      path.resolve(__dirname, '../../src/main/ipc/ipc_initialization_runtime.cjs'),
      'utf8',
    );

    expect(mainSource).toContain('createImageInteractionHandlersRuntime({');
    expect(mainSource).not.toContain('imageInteractionHandlersRuntime.register({ ipcMain })');
    expect(initializationSource).toContain('imageInteractionHandlersRuntime.register({ ipcMain })');
    expect(mainSource).not.toContain('registerImageInteractionHandlers({');
    expect(mainSource).not.toContain('registerClipboardImageHandler');
    expect(mainSource).not.toContain('registerImageContextMenuHandler');
    expect(mainSource).not.toContain('getTrustedImageOrigins: () => [');
    expect(helperSource).toContain('function createImageInteractionHandlersRuntime');
    expect(helperSource).toContain('return registerImageInteractionHandlers({');
    expect(helperSource).toContain("ipcMain.handle('copy-image-to-clipboard'");
    expect(helperSource).toContain("ipcMain.handle('show-image-context-menu'");
    const helperModule = require('../../src/main/ipc/ipc_image_interaction_handlers.cjs');
    expect(helperModule.registerImageInteractionHandlers).toBeUndefined();
  });

  test('keeps trusted image origin construction private to the aggregate owner', () => {
    expect(imageInteractionHandlersModule.buildTrustedImageOrigins).toBeUndefined();
  });
});
