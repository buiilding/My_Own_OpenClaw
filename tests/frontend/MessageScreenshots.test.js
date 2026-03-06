import {
  hasMessageScreenshot,
  isUserMessageWithScreenshot,
  resolveMessageScreenshotSrcList,
} from '../../frontend/src/renderer/features/chat/utils/message/messageScreenshots';

describe('messageScreenshots', () => {
  test('detects screenshot fields from url/ref/inline payload', () => {
    expect(hasMessageScreenshot({ screenshotUrl: 'https://cdn.example/a.png' })).toBe(true);
    expect(hasMessageScreenshot({ screenshotRef: 'artifact-123' })).toBe(true);
    expect(hasMessageScreenshot({ screenshot: 'base64' })).toBe(true);
  });

  test('returns false when no screenshot fields exist', () => {
    expect(hasMessageScreenshot({ text: 'plain text' })).toBe(false);
  });

  test('treats empty screenshot fields as falsey', () => {
    expect(hasMessageScreenshot({ screenshotUrl: '' })).toBe(false);
    expect(hasMessageScreenshot({ screenshotRef: '' })).toBe(false);
    expect(hasMessageScreenshot({ screenshot: '' })).toBe(false);
  });

  test('matches only user messages with screenshot payloads', () => {
    expect(isUserMessageWithScreenshot({ sender: 'user', screenshotRef: 'artifact-123' })).toBe(true);
    expect(isUserMessageWithScreenshot({ sender: 'assistant', screenshotRef: 'artifact-123' })).toBe(false);
    expect(isUserMessageWithScreenshot({ sender: 'user' })).toBe(false);
  });

  test('resolves multiple screenshot sources from screenshots array', () => {
    const sources = resolveMessageScreenshotSrcList({
      screenshots: [
        { screenshotRef: 'artifact-1' },
        { screenshot: 'base64-2', screenshotContentType: 'image/png' },
      ],
    });

    expect(sources).toHaveLength(2);
    expect(sources[0]).toContain('/api/artifacts/artifact-1');
    expect(sources[1]).toBe('data:image/png;base64,base64-2');
  });
});
