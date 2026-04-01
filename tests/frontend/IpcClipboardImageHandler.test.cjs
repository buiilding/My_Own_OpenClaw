/** @jest-environment node */

const {
  copyImageToClipboard,
  registerClipboardImageHandler,
} = require('../../frontend/src/main/ipc/ipc_clipboard_image.cjs');

describe('ipc clipboard image handler', () => {
  test('writes data URL images to the Electron clipboard without fetching', async () => {
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
    const fetchImpl = jest.fn();

    const result = await copyImageToClipboard({
      src: 'data:image/png;base64,abc123',
      clipboard,
      nativeImage,
      fetchImpl,
    });

    expect(result).toEqual({ success: true });
    expect(nativeImage.createFromDataURL).toHaveBeenCalledWith('data:image/png;base64,abc123');
    expect(nativeImage.createFromBuffer).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(clipboard.writeImage).toHaveBeenCalledWith(decodedImage);
  });

  test('fetches remote images and decodes the returned bytes before writing to clipboard', async () => {
    const clipboard = {
      writeImage: jest.fn(),
    };
    const decodedImage = {
      isEmpty: jest.fn(() => false),
    };
    const nativeImage = {
      createFromDataURL: jest.fn(),
      createFromBuffer: jest.fn(() => decodedImage),
    };
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => Uint8Array.from([137, 80, 78, 71]).buffer,
    });

    const result = await copyImageToClipboard({
      src: 'https://cdn.example/screenshot.png',
      clipboard,
      nativeImage,
      fetchImpl,
    });

    expect(result).toEqual({ success: true });
    expect(fetchImpl).toHaveBeenCalledWith('https://cdn.example/screenshot.png');
    expect(nativeImage.createFromBuffer).toHaveBeenCalledWith(expect.any(Buffer));
    expect(clipboard.writeImage).toHaveBeenCalledWith(decodedImage);
  });

  test('registers a safe IPC handler that returns structured failure payloads', async () => {
    const invokeHandlers = {};
    const ipcMain = {
      handle: jest.fn((channel, handler) => {
        invokeHandlers[channel] = handler;
      }),
    };

    registerClipboardImageHandler({
      ipcMain,
      clipboard: { writeImage: jest.fn() },
      nativeImage: {
        createFromDataURL: jest.fn(() => ({
          isEmpty: jest.fn(() => true),
        })),
      },
    });

    expect(typeof invokeHandlers['copy-image-to-clipboard']).toBe('function');

    const result = await invokeHandlers['copy-image-to-clipboard'](null, {
      src: 'data:image/png;base64,broken',
    });

    expect(result).toEqual({
      success: false,
      error: 'Failed to decode image for clipboard copy.',
    });
  });
});
