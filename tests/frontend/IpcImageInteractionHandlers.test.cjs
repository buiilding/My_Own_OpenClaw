/** @jest-environment node */

const fs = require('fs/promises');
const path = require('path');
const {
  buildTrustedImageOrigins,
  createImageInteractionHandlersRuntime,
  registerImageInteractionHandlers,
} = require('../../frontend/src/main/ipc/ipc_image_interaction_handlers.cjs');

describe('ipc image interaction handlers', () => {
  test('builds trusted origins from active backend endpoint and candidates', () => {
    expect(buildTrustedImageOrigins({
      getBackendHttpUrl: () => 'https://api.windieos.com',
      getBackendCandidates: () => [
        { httpUrl: 'https://candidate-a.windieos.com' },
        { httpUrl: '' },
        {},
        { httpUrl: 'https://candidate-b.windieos.com' },
      ],
    })).toEqual([
      'https://api.windieos.com',
      'https://candidate-a.windieos.com',
      'https://candidate-b.windieos.com',
    ]);
  });

  test('registers clipboard and context menu handlers with the same trusted origin policy', () => {
    const registerClipboardImageHandler = jest.fn();
    const registerImageContextMenuHandler = jest.fn();
    const ipcMain = {};
    const Menu = {};
    const BrowserWindow = {};
    const clipboard = {};
    const nativeImage = {};

    registerImageInteractionHandlers({
      ipcMain,
      Menu,
      BrowserWindow,
      clipboard,
      nativeImage,
      registerClipboardImageHandler,
      registerImageContextMenuHandler,
      getBackendHttpUrl: () => 'https://api.windieos.com',
      getBackendCandidates: () => [
        { httpUrl: 'https://candidate.windieos.com' },
      ],
    });

    expect(registerClipboardImageHandler).toHaveBeenCalledWith({
      ipcMain,
      clipboard,
      nativeImage,
      getTrustedImageOrigins: expect.any(Function),
    });
    expect(registerImageContextMenuHandler).toHaveBeenCalledWith({
      ipcMain,
      Menu,
      BrowserWindow,
      clipboard,
      nativeImage,
      getTrustedImageOrigins: expect.any(Function),
    });
    expect(registerClipboardImageHandler.mock.calls[0][0].getTrustedImageOrigins()).toEqual([
      'https://api.windieos.com',
      'https://candidate.windieos.com',
    ]);
    expect(registerImageContextMenuHandler.mock.calls[0][0].getTrustedImageOrigins()).toEqual([
      'https://api.windieos.com',
      'https://candidate.windieos.com',
    ]);
  });

  test('runtime registers image handlers with injected Electron and backend dependencies', () => {
    const registerClipboardImageHandler = jest.fn();
    const registerImageContextMenuHandler = jest.fn();
    const ipcMain = {};
    const Menu = {};
    const BrowserWindow = {};
    const clipboard = {};
    const nativeImage = {};
    const runtime = createImageInteractionHandlersRuntime({
      Menu,
      BrowserWindow,
      clipboard,
      nativeImage,
      registerClipboardImageHandler,
      registerImageContextMenuHandler,
      getBackendHttpUrl: () => 'https://runtime.windieos.test',
      getBackendCandidates: () => [
        { httpUrl: 'https://candidate.windieos.test' },
      ],
    });

    runtime.register({ ipcMain });

    expect(registerClipboardImageHandler).toHaveBeenCalledWith({
      ipcMain,
      clipboard,
      nativeImage,
      getTrustedImageOrigins: expect.any(Function),
    });
    expect(registerImageContextMenuHandler).toHaveBeenCalledWith({
      ipcMain,
      Menu,
      BrowserWindow,
      clipboard,
      nativeImage,
      getTrustedImageOrigins: expect.any(Function),
    });
    expect(registerClipboardImageHandler.mock.calls[0][0].getTrustedImageOrigins()).toEqual([
      'https://runtime.windieos.test',
      'https://candidate.windieos.test',
    ]);
  });

  test('ipc.cjs delegates image IPC registration through the image interaction helper', async () => {
    const mainSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/main/ipc.cjs'),
      'utf8',
    );
    const helperSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/main/ipc/ipc_image_interaction_handlers.cjs'),
      'utf8',
    );

    expect(mainSource).toContain('createImageInteractionHandlersRuntime({');
    expect(mainSource).toContain('imageInteractionHandlersRuntime.register({ ipcMain })');
    expect(mainSource).not.toContain('registerImageInteractionHandlers({');
    expect(mainSource).not.toContain('getTrustedImageOrigins: () => [');
    expect(helperSource).toContain('function createImageInteractionHandlersRuntime');
    expect(helperSource).toContain('return registerImageInteractionHandlers({');
  });
});
