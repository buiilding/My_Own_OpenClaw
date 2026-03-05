import { parseSelectedComposerFiles } from '../../frontend/src/renderer/features/chat/utils/fileAttachmentUtils';

describe('fileAttachmentUtils', () => {
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
        this.result = 'data:image/jpeg;base64,ZmFrZS1pbWFnZQ==';
        if (typeof this.onload === 'function') {
          this.onload();
        }
      }
    };
  });

  afterEach(() => {
    global.FileReader = originalFileReader;
  });

  test('separates image attachments from readable file paths', async () => {
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
