/** @jest-environment node */

const {
  registerImageContextMenuHandler,
} = require('../../frontend/src/main/ipc/ipc_image_context_menu.cjs');

describe('ipc image context menu handler', () => {
  function registerHandler(options) {
    const invokeHandlers = {};
    const ipcMain = {
      handle: jest.fn((channel, handler) => {
        invokeHandlers[channel] = handler;
      }),
    };
    registerImageContextMenuHandler({
      ipcMain,
      ...options,
    });
    return {
      ipcMain,
      handler: invokeHandlers['show-image-context-menu'],
    };
  }

  test('builds a native menu with a single copy-image item', async () => {
    const popup = jest.fn();
    const builtMenu = { popup };
    const Menu = {
      buildFromTemplate: jest.fn(() => builtMenu),
    };
    const { handler } = registerHandler({
      Menu,
      BrowserWindow: null,
      clipboard: null,
      nativeImage: null,
    });

    const result = await handler({ sender: {} }, {
      src: 'https://cdn.example/screenshot.png',
    });

    expect(result).toEqual({ success: true });
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
    const { handler } = registerHandler({
      Menu,
      BrowserWindow,
      clipboard,
      nativeImage,
    });

    const result = await handler({ sender }, {
      src: 'data:image/png;base64,abc123',
    });

    expect(result).toEqual({ success: true });
    expect(BrowserWindow.fromWebContents).toHaveBeenCalledWith(sender);
    expect(popup).toHaveBeenCalledWith({ window: targetWindow });

    await templateEntries[0].click();

    expect(nativeImage.createFromDataURL).toHaveBeenCalledWith('data:image/png;base64,abc123');
    expect(clipboard.writeImage).toHaveBeenCalledWith(decodedImage);
  });

  test('context menu copy action rejects untrusted remote image URLs', async () => {
    const popup = jest.fn();
    const templateEntries = [];
    const Menu = {
      buildFromTemplate: jest.fn((entries) => {
        templateEntries.push(...entries);
        return { popup };
      }),
    };
    const fetchImpl = jest.fn();
    const { handler } = registerHandler({
      Menu,
      BrowserWindow: {
        fromWebContents: jest.fn(() => null),
      },
      clipboard: { writeImage: jest.fn() },
      nativeImage: {
        createFromDataURL: jest.fn(),
        createFromBuffer: jest.fn(),
      },
      fetchImpl,
      trustedImageOrigins: ['https://backend.example.com'],
    });

    const result = await handler({ sender: {} }, {
      src: 'https://cdn.example/screenshot.png',
    });

    expect(result).toEqual({ success: true });
    await expect(templateEntries[0].click()).rejects.toThrow('not a trusted artifact image');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test('registers a safe IPC handler that returns structured failures', async () => {
    const { handler } = registerHandler({
      Menu: null,
      BrowserWindow: null,
      clipboard: null,
      nativeImage: null,
    });

    expect(typeof handler).toBe('function');

    const result = await handler(null, {
      src: 'https://cdn.example/screenshot.png',
    });

    expect(result).toEqual({
      success: false,
      error: 'Native menu support is unavailable.',
    });
  });
});
