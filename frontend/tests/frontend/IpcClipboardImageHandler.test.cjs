/** @jest-environment node */

const {
  createClipboardImageRuntime,
} = require('../../src/main/ipc/ipc_clipboard_image.cjs');
const clipboardImageModule = require('../../src/main/ipc/ipc_clipboard_image.cjs');

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

    const runtime = createClipboardImageRuntime({
      clipboard,
      nativeImage,
      fetchImpl,
    });
    const result = await runtime.copy({
      src: 'data:image/png;base64,abc123',
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

    const runtime = createClipboardImageRuntime({
      clipboard,
      nativeImage,
      fetchImpl,
      trustedImageOrigins: ['https://backend.example.com'],
    });
    const result = await runtime.copy({
      src: 'https://backend.example.com/api/artifacts/screenshot.png',
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

    const runtime = createClipboardImageRuntime({
      clipboard,
      nativeImage,
      fetchImpl,
    });

    await expect(runtime.copy({
      src: 'file:///Users/peter/private.png',
    })).rejects.toThrow('scheme is not allowed');

    await expect(runtime.copy({
      src: 'http://127.0.0.1:8765/api/artifacts/private.png',
    })).rejects.toThrow('not a trusted artifact image');

    await expect(runtime.copy({
      src: 'https://cdn.example/screenshot.png',
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

    const runtime = createClipboardImageRuntime({
      clipboard,
      nativeImage,
    });

    await expect(runtime.copy({
      src: `data:image/png;base64,${'a'.repeat(16)}`,
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

    const runtime = createClipboardImageRuntime({
      clipboard,
      nativeImage,
      trustedImageOrigins: ['https://backend.example.com'],
    });

    await expect(runtime.copy({
      src: 'https://backend.example.com/api/artifacts/not-image',
      fetchImpl: jest.fn().mockResolvedValue(imageResponse({ contentType: 'text/html' })),
    })).rejects.toThrow('image content type');

    await expect(runtime.copy({
      src: 'https://backend.example.com/api/artifacts/too-large',
      fetchImpl: jest.fn().mockResolvedValue(imageResponse({ contentLength: '9' })),
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

    const runtime = createClipboardImageRuntime({
      clipboard,
      nativeImage,
      fetchImpl,
      trustedImageOrigins: ['https://backend.example.com'],
    });

    await expect(runtime.copy({
      src: 'https://backend.example.com/api/artifacts/redirect',
    })).rejects.toThrow('not a trusted artifact image');

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(nativeImage.createFromBuffer).not.toHaveBeenCalled();
  });

  test('keeps lower-level clipboard copy private behind the runtime facade', () => {
    expect(clipboardImageModule.copyImageToClipboard).toBeUndefined();
    expect(clipboardImageModule.registerClipboardImageHandler).toBeUndefined();
  });
});
