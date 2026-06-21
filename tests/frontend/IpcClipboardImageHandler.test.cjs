/** @jest-environment node */

const {
  copyImageToClipboard,
  registerClipboardImageHandler,
} = require('../../frontend/src/main/ipc/ipc_clipboard_image.cjs');

function imageResponse({
  status = 200,
  contentType = 'image/png',
  contentLength = null,
  bytes = [137, 80, 78, 71],
  location = null,
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
        if (normalizedName === 'content-length') {
          return contentLength;
        }
        if (normalizedName === 'location') {
          return location;
        }
        return null;
      }),
    },
    arrayBuffer: async () => Uint8Array.from(bytes).buffer,
  };
}

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

  test('fetches trusted artifact images and decodes the returned bytes before writing to clipboard', async () => {
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
    const fetchImpl = jest.fn().mockResolvedValue(imageResponse());

    const result = await copyImageToClipboard({
      src: 'https://backend.example.com/api/artifacts/screenshot.png',
      clipboard,
      nativeImage,
      fetchImpl,
      trustedImageOrigins: ['https://backend.example.com'],
    });

    expect(result).toEqual({ success: true });
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://backend.example.com/api/artifacts/screenshot.png',
      { redirect: 'manual' },
    );
    expect(nativeImage.createFromBuffer).toHaveBeenCalledWith(expect.any(Buffer));
    expect(clipboard.writeImage).toHaveBeenCalledWith(decodedImage);
  });

  test('rejects arbitrary URL schemes and untrusted remote origins without fetching', async () => {
    const clipboard = { writeImage: jest.fn() };
    const nativeImage = {
      createFromDataURL: jest.fn(),
      createFromBuffer: jest.fn(),
    };
    const fetchImpl = jest.fn();

    await expect(copyImageToClipboard({
      src: 'file:///Users/peter/private.png',
      clipboard,
      nativeImage,
      fetchImpl,
    })).rejects.toThrow('scheme is not allowed');

    await expect(copyImageToClipboard({
      src: 'http://127.0.0.1:8765/api/artifacts/private.png',
      clipboard,
      nativeImage,
      fetchImpl,
    })).rejects.toThrow('not a trusted artifact image');

    await expect(copyImageToClipboard({
      src: 'https://cdn.example/screenshot.png',
      clipboard,
      nativeImage,
      fetchImpl,
      trustedImageOrigins: ['https://backend.example.com'],
    })).rejects.toThrow('not a trusted artifact image');

    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test('rejects oversized data URLs before decoding', async () => {
    const clipboard = { writeImage: jest.fn() };
    const nativeImage = {
      createFromDataURL: jest.fn(),
      createFromBuffer: jest.fn(),
    };

    await expect(copyImageToClipboard({
      src: `data:image/png;base64,${'a'.repeat(16)}`,
      clipboard,
      nativeImage,
      maxDataUrlBytes: 4,
    })).rejects.toThrow('data URL is too large');

    expect(nativeImage.createFromDataURL).not.toHaveBeenCalled();
  });

  test('rejects non-image and oversized trusted artifact responses', async () => {
    const clipboard = { writeImage: jest.fn() };
    const nativeImage = {
      createFromDataURL: jest.fn(),
      createFromBuffer: jest.fn(),
    };

    await expect(copyImageToClipboard({
      src: 'https://backend.example.com/api/artifacts/not-image',
      clipboard,
      nativeImage,
      fetchImpl: jest.fn().mockResolvedValue(imageResponse({ contentType: 'text/html' })),
      trustedImageOrigins: ['https://backend.example.com'],
    })).rejects.toThrow('image content type');

    await expect(copyImageToClipboard({
      src: 'https://backend.example.com/api/artifacts/too-large',
      clipboard,
      nativeImage,
      fetchImpl: jest.fn().mockResolvedValue(imageResponse({ contentLength: '9' })),
      trustedImageOrigins: ['https://backend.example.com'],
      maxRemoteImageBytes: 4,
    })).rejects.toThrow('too large');

    expect(nativeImage.createFromBuffer).not.toHaveBeenCalled();
  });

  test('rejects redirects from trusted artifacts to untrusted origins', async () => {
    const clipboard = { writeImage: jest.fn() };
    const nativeImage = {
      createFromDataURL: jest.fn(),
      createFromBuffer: jest.fn(),
    };
    const fetchImpl = jest.fn().mockResolvedValue(imageResponse({
      status: 302,
      location: 'http://169.254.169.254/latest/meta-data',
    }));

    await expect(copyImageToClipboard({
      src: 'https://backend.example.com/api/artifacts/redirect',
      clipboard,
      nativeImage,
      fetchImpl,
      trustedImageOrigins: ['https://backend.example.com'],
    })).rejects.toThrow('not a trusted artifact image');

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(nativeImage.createFromBuffer).not.toHaveBeenCalled();
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
