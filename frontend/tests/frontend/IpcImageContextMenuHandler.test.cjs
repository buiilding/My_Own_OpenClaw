/** @jest-environment node */

const {
  createImageContextMenuRuntime,
} = require('../../src/main/ipc/ipc_image_context_menu.cjs');
const imageContextMenuModule = require('../../src/main/ipc/ipc_image_context_menu.cjs');

describe('ipc image context menu handler', () => {
  function createRuntime(options) {
    const runtime = createImageContextMenuRuntime({
      ...options,
    });
    return {
      show: (event, payload) => runtime.show({
        event,
        src: payload?.src,
      }),
    };
  }

  test('builds a native menu with a single copy-image item', async () => {
    const popup = jest.fn();
    const builtMenu = { popup };
    const Menu = {
      buildFromTemplate: jest.fn(() => builtMenu),
    };
    const { show } = createRuntime({
      Menu,
      BrowserWindow: null,
      clipboard: null,
      nativeImage: null,
    });

    const result = await show({ sender: {} }, {
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
    const { show } = createRuntime({
      Menu,
      BrowserWindow,
      clipboard,
      nativeImage,
    });

    const result = await show({ sender }, {
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
    const { show } = createRuntime({
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

    const result = await show({ sender: {} }, {
      src: 'https://cdn.example/screenshot.png',
    });

    expect(result).toEqual({ success: true });
    await expect(templateEntries[0].click()).rejects.toThrow('not a trusted artifact image');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test('throws runtime errors for the aggregate IPC owner to structure', async () => {
    const { show } = createRuntime({
      Menu: null,
      BrowserWindow: null,
      clipboard: null,
      nativeImage: null,
    });

    await expect(show(null, {
      src: 'https://cdn.example/screenshot.png',
    })).rejects.toThrow('Native menu support is unavailable.');
  });

  test('keeps lower-level context menu registration private behind the aggregate owner', () => {
    expect(imageContextMenuModule.registerImageContextMenuHandler).toBeUndefined();
  });
});
