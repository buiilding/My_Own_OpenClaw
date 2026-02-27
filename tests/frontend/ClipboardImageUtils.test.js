import { parseClipboardImageItems } from '../../frontend/src/renderer/features/chat/utils/clipboardImageUtils';

describe('clipboardImageUtils', () => {
  const originalFileReader = global.FileReader;

  beforeEach(() => {
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
  });

  afterEach(() => {
    global.FileReader = originalFileReader;
  });

  test('returns only image clipboard items and skips non-images', async () => {
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
});
