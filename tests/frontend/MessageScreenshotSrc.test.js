import { resolveMessageScreenshotSrc } from '../../frontend/src/renderer/features/chat/utils/message/messageScreenshots';

describe('resolveMessageScreenshotSrc', () => {
  test('prefers screenshot URL when url and inline data both exist', () => {
    expect(
      resolveMessageScreenshotSrc({
        screenshotUrl: 'https://cdn.example/screenshot.png',
        screenshot: 'inline-data',
      }),
    ).toBe('https://cdn.example/screenshot.png');
  });

  test('returns inline data URL when screenshot payload exists', () => {
    expect(
      resolveMessageScreenshotSrc({
        screenshot: 'abc123',
        screenshotContentType: 'image/png',
      }),
    ).toBe('data:image/png;base64,abc123');
  });

  test('builds artifact URL when screenshotRef is present', () => {
    expect(
      resolveMessageScreenshotSrc({
        screenshotRef: 'artifact-123',
      }),
    ).toBe('http://127.0.0.1:8765/api/artifacts/artifact-123');
  });

  test('defaults inline screenshot content type to jpeg when missing or invalid', () => {
    expect(resolveMessageScreenshotSrc({ screenshot: 'raw' })).toBe('data:image/jpeg;base64,raw');
    expect(
      resolveMessageScreenshotSrc({
        screenshot: 'raw',
        screenshotContentType: 'text/plain',
      }),
    ).toBe('data:image/jpeg;base64,raw');
  });

  test('returns null when no screenshot data is present', () => {
    expect(resolveMessageScreenshotSrc({ text: 'plain message' })).toBeNull();
    expect(resolveMessageScreenshotSrc(null)).toBeNull();
  });
});
