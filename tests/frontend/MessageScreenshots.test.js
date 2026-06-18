/**
 * Covers message screenshots. behavior in the frontend test suite.
 */

import {
  hasMessageScreenshot,
  isUserMessageWithScreenshot,
  resolveMessageScreenshotAttachments,
  resolveStaticScreenshotAttachmentSrc,
} from '../../frontend/src/renderer/features/chat/utils/message/messageScreenshots';
import { DesktopArtifactRuntimeClient } from '../../frontend/src/renderer/app/runtime/desktopArtifactRuntimeClient';

jest.mock('../../frontend/src/renderer/app/runtime/desktopArtifactRuntimeClient', () => ({
  DesktopArtifactRuntimeClient: {
    buildArtifactUrl: jest.fn((artifactId) => `http://runtime.test/api/artifacts/${artifactId}`),
  },
}));

describe('messageScreenshots', () => {
  beforeEach(() => {
    DesktopArtifactRuntimeClient.buildArtifactUrl.mockClear();
  });

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

  test('normalizes multiple screenshot attachments from screenshots array', () => {
    const attachments = resolveMessageScreenshotAttachments({
      screenshots: [
        { screenshotRef: 'artifact-1' },
        { screenshot: 'base64-2', screenshotContentType: 'image/png' },
      ],
    });

    expect(attachments).toHaveLength(2);
    expect(attachments[0]).toMatchObject({ screenshotRef: 'artifact-1' });
    expect(attachments[1]).toMatchObject({
      screenshot: 'base64-2',
      screenshotContentType: 'image/png',
    });
  });

  test('resolves static screenshot sources from url and inline payloads', () => {
    expect(
      resolveStaticScreenshotAttachmentSrc({
        screenshotUrl: 'https://cdn.example/screenshot.png',
        screenshot: 'inline-data',
      }),
    ).toBe('https://cdn.example/screenshot.png');
    expect(
      resolveStaticScreenshotAttachmentSrc({
        screenshot: 'abc123',
        screenshotContentType: 'image/png',
      }),
    ).toBe('data:image/png;base64,abc123');
    expect(resolveStaticScreenshotAttachmentSrc({ screenshot: 'raw' }))
      .toBe('data:image/jpeg;base64,raw');
    expect(
      resolveStaticScreenshotAttachmentSrc({
        screenshot: 'raw',
        screenshotContentType: 'text/plain',
      }),
    ).toBe('data:image/jpeg;base64,raw');
  });

  test('resolves inline artifact screenshots through the artifact runtime client', () => {
    expect(
      resolveStaticScreenshotAttachmentSrc({
        screenshot: 'inline-data',
        screenshotRef: 'artifact-123',
      }),
    ).toBe('http://runtime.test/api/artifacts/artifact-123');
    expect(DesktopArtifactRuntimeClient.buildArtifactUrl).toHaveBeenCalledWith('artifact-123');
  });

  test('leaves artifact-backed screenshots for async resolution', () => {
    expect(resolveStaticScreenshotAttachmentSrc({ screenshotRef: 'artifact-123' })).toBeNull();
    expect(resolveStaticScreenshotAttachmentSrc({ text: 'plain message' })).toBeNull();
    expect(resolveStaticScreenshotAttachmentSrc(null)).toBeNull();
  });
});
