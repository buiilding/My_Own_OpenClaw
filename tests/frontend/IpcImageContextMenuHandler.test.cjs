/** @jest-environment node */

const {
  buildImageContextMenu,
  showImageContextMenu,
  registerImageContextMenuHandler,
} = require('../../frontend/src/main/ipc/ipc_image_context_menu.cjs');

describe('ipc image context menu handler', () => {
  test('builds a native menu with a single copy-image item', () => {
    const popup = jest.fn();
    const builtMenu = { popup };
    const Menu = {
      buildFromTemplate: jest.fn(() => builtMenu),
    };
    const onCopy = jest.fn();

    const menu = buildImageContextMenu({
      src: 'https://cdn.example/screenshot.png',
      Menu,
      onCopy,
    });

    expect(menu).toBe(builtMenu);
    expect(Menu.buildFromTemplate).toHaveBeenCalledWith([
      expect.objectContaining({
        label: 'Copy image',
        click: expect.any(Function),
      }),
    ]);
  });

  test('shows the native menu on the sender window and copies on menu click', async () => {
    const popup = jest.fn();
    const templateEntries = [];
    const Menu = {
      buildFromTemplate: jest.fn((entries) => {
        templateEntries.push(...entries);
        return { popup };
      }),
    };
    const targetWindow = { id: 1 };
    const BrowserWindow = {
      fromWebContents: jest.fn(() => targetWindow),
    };
    const clipboard = {
      writeImage: jest.fn(),
    };
    const decodedImage = {
      isEmpty: jest.fn(() => false),
    };
    const nativeImage = {
      createFromDataURL: jest.fn(() => decodedImage),
      createFromBuffer: jest.fn(),
    };
    const sender = {};

    const result = await showImageContextMenu({
      event: { sender },
      src: 'data:image/png;base64,abc123',
      Menu,
      BrowserWindow,
      clipboard,
      nativeImage,
    });

    expect(result).toEqual({ success: true });
    expect(BrowserWindow.fromWebContents).toHaveBeenCalledWith(sender);
    expect(popup).toHaveBeenCalledWith({ window: targetWindow });

    await templateEntries[0].click();

    expect(nativeImage.createFromDataURL).toHaveBeenCalledWith('data:image/png;base64,abc123');
    expect(clipboard.writeImage).toHaveBeenCalledWith(decodedImage);
  });

  test('registers a safe IPC handler that returns structured failures', async () => {
    const invokeHandlers = {};
    const ipcMain = {
      handle: jest.fn((channel, handler) => {
        invokeHandlers[channel] = handler;
      }),
    };

    registerImageContextMenuHandler({
      ipcMain,
      Menu: null,
      BrowserWindow: null,
      clipboard: null,
      nativeImage: null,
    });

    expect(typeof invokeHandlers['show-image-context-menu']).toBe('function');

    const result = await invokeHandlers['show-image-context-menu'](null, {
      src: 'https://cdn.example/screenshot.png',
    });

    expect(result).toEqual({
      success: false,
      error: 'Native menu support is unavailable.',
    });
  });
});
