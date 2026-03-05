import {
  parseBase64ImageDataUrl,
  readFileAsDataUrl,
} from '../../frontend/src/renderer/features/chat/utils/dataUrlImageUtils';

describe('dataUrlImageUtils', () => {
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
});
