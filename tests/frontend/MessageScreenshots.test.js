import {
  hasMessageScreenshot,
  isUserMessageWithScreenshot,
} from '../../frontend/src/renderer/features/chat/utils/messageScreenshots';

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
});
