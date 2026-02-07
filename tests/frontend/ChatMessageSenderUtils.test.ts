import {
  buildArtifactUploadMeta,
  buildPendingUserMessage,
  hasUserMessages,
  toScreenshotAttachment,
} from '../../frontend/src/renderer/features/chat/utils/chatMessageSenderUtils';

describe('chatMessageSenderUtils', () => {
  test('hasUserMessages detects whether user messages exist', () => {
    expect(hasUserMessages([{ sender: 'assistant' } as any])).toBe(false);
    expect(hasUserMessages([{ sender: 'assistant' } as any, { sender: 'user' } as any])).toBe(true);
  });

  test('buildPendingUserMessage creates user message with empty screenshot payload', () => {
    expect(buildPendingUserMessage('msg-1', 'hello')).toEqual({
      id: 'msg-1',
      text: 'hello',
      sender: 'user',
      screenshot: null,
    });
  });

  test('buildArtifactUploadMeta normalizes content type and extension', () => {
    expect(buildArtifactUploadMeta('image/png')).toEqual({
      contentType: 'image/png',
      filename: 'user-message.png',
    });

    expect(buildArtifactUploadMeta('text/plain')).toEqual({
      contentType: 'image/jpeg',
      filename: 'user-message.jpg',
    });
  });

  test('toScreenshotAttachment maps uploaded artifact values and defaults to nulls', () => {
    expect(toScreenshotAttachment({ artifactId: 'artifact-1', url: 'https://cdn.example/a.png' })).toEqual({
      screenshotRef: 'artifact-1',
      screenshotUrl: 'https://cdn.example/a.png',
    });

    expect(toScreenshotAttachment(null)).toEqual({
      screenshotRef: null,
      screenshotUrl: null,
    });
  });
});
