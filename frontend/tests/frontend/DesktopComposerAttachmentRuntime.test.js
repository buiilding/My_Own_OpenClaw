/**
 * Covers desktop composer attachment runtime behavior in the frontend test suite.
 */

import {
  DesktopComposerAttachmentRuntime,
} from '../../src/renderer/app/runtime/desktopComposerAttachmentRuntime';

const {
  parseBase64ImageDataUrl,
  parseClipboardImagePasteEvent,
  parseClipboardImageItems,
  parseSelectedComposerFiles,
  readFileAsDataUrl,
} = DesktopComposerAttachmentRuntime;

describe('desktopComposerAttachmentRuntime', () => {
  const originalFileReader = global.FileReader;

  afterEach(() => {
    global.FileReader = originalFileReader;
  });

  test('parseBase64ImageDataUrl parses base64 image payload', () => {
    const parsed = parseBase64ImageDataUrl('data:image/png;base64,ZmFrZS1iYXNlNjQ=');

    expect(parsed).toEqual({
      base64: 'ZmFrZS1iYXNlNjQ=',
      contentType: 'image/png',
      extension: 'png',
      previewUrl: 'data:image/png;base64,ZmFrZS1iYXNlNjQ=',
    });
  });

  test('parseBase64ImageDataUrl returns null for non-base64 data URL', () => {
    expect(parseBase64ImageDataUrl('data:image/png,not-base64')).toBeNull();
  });

  test('readFileAsDataUrl resolves with string result', async () => {
    global.FileReader = class MockFileReader {
      constructor() {
        this.result = null;
        this.error = null;
        this.onload = null;
        this.onerror = null;
      }

      readAsDataURL() {
        this.result = 'data:image/png;base64,ZmFrZS1iYXNlNjQ=';
        if (typeof this.onload === 'function') {
          this.onload();
        }
      }
    };

    await expect(readFileAsDataUrl({})).resolves.toBe('data:image/png;base64,ZmFrZS1iYXNlNjQ=');
  });

  test('readFileAsDataUrl rejects with configured load error when FileReader result is not a string', async () => {
    global.FileReader = class MockFileReader {
      constructor() {
        this.result = null;
        this.error = null;
        this.onload = null;
      }

      readAsDataURL() {
        this.result = { invalid: true };
        if (typeof this.onload === 'function') {
          this.onload();
        }
      }
    };

    await expect(
      readFileAsDataUrl(
        {},
        { loadErrorMessage: 'custom-load-failure' },
      ),
    ).rejects.toThrow('custom-load-failure');
  });

  test('returns only image clipboard items and skips non-images', async () => {
    global.FileReader = class MockFileReader {
      constructor() {
        this.result = null;
        this.error = null;
        this.onload = null;
        this.onerror = null;
      }

      readAsDataURL() {
        this.result = 'data:image/png;base64,ZmFrZS1iYXNlNjQ=';
        if (typeof this.onload === 'function') {
          this.onload();
        }
      }
    };

    const parsed = await parseClipboardImageItems([
      {
        type: 'text/plain',
        getAsFile: () => null,
      },
      {
        type: 'image/png',
        getAsFile: () => new Blob(['image'], { type: 'image/png' }),
      },
    ]);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toEqual(expect.objectContaining({
      base64: 'ZmFrZS1iYXNlNjQ=',
      contentType: 'image/png',
      filename: 'clipboard-image.png',
      previewUrl: 'data:image/png;base64,ZmFrZS1iYXNlNjQ=',
    }));
    expect(typeof parsed[0].id).toBe('string');
  });

  test('parseClipboardImagePasteEvent exposes image presence and parsed images', async () => {
    global.FileReader = class MockFileReader {
      constructor() {
        this.result = null;
        this.error = null;
        this.onload = null;
        this.onerror = null;
      }

      readAsDataURL() {
        this.result = 'data:image/webp;base64,ZmFrZS13ZWJw';
        if (typeof this.onload === 'function') {
          this.onload();
        }
      }
    };

    const parsed = await parseClipboardImagePasteEvent({
      clipboardData: {
        items: [
          {
            type: 'text/plain',
            getAsFile: () => null,
          },
          {
            type: 'image/webp',
            getAsFile: () => new Blob(['image'], { type: 'image/webp' }),
          },
        ],
      },
    });

    expect(parsed.hasImageItems).toBe(true);
    expect(parsed.images).toHaveLength(1);
    expect(parsed.images[0]).toEqual(expect.objectContaining({
      base64: 'ZmFrZS13ZWJw',
      contentType: 'image/webp',
      filename: 'clipboard-image.webp',
      previewUrl: 'data:image/webp;base64,ZmFrZS13ZWJw',
    }));
  });

  test('parseClipboardImagePasteEvent reports text-only paste events without FileReader work', async () => {
    const parsed = await parseClipboardImagePasteEvent({
      clipboardData: {
        items: [
          {
            type: 'text/plain',
            getAsFile: () => null,
          },
        ],
      },
    });

    expect(parsed).toEqual({
      hasImageItems: false,
      images: [],
    });
  });

  test('separates image attachments from readable file paths', async () => {
    global.FileReader = class MockFileReader {
      constructor() {
        this.result = null;
        this.error = null;
        this.onload = null;
        this.onerror = null;
      }

      readAsDataURL() {
        this.result = 'data:image/jpeg;base64,ZmFrZS1pbWFnZQ==';
        if (typeof this.onload === 'function') {
          this.onload();
        }
      }
    };

    const parsed = await parseSelectedComposerFiles([
      {
        name: 'photo.jpg',
        type: 'image/jpeg',
      },
      {
        name: 'notes.txt',
        type: 'text/plain',
        path: '/tmp/notes.txt',
      },
      {
        name: 'ignored.txt',
        type: 'text/plain',
      },
    ]);

    expect(parsed.imageAttachments).toHaveLength(1);
    expect(parsed.imageAttachments[0]).toEqual(expect.objectContaining({
      base64: 'ZmFrZS1pbWFnZQ==',
      contentType: 'image/jpeg',
      filename: 'photo.jpg',
      previewUrl: 'data:image/jpeg;base64,ZmFrZS1pbWFnZQ==',
    }));
    expect(typeof parsed.imageAttachments[0].id).toBe('string');

    expect(parsed.readableFiles).toEqual([
      expect.objectContaining({
        filename: 'notes.txt',
        filePath: '/tmp/notes.txt',
      }),
    ]);
    expect(typeof parsed.readableFiles[0].id).toBe('string');
  });
});
