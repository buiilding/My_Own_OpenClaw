import {
  buildScreenshotAttachment,
  resolveErrorText,
  resolveToolOutputCorrelationId,
  shouldIgnoreStreamError,
} from '../../frontend/src/renderer/features/chat/utils/chatStreamEventUtils';

describe('chatStreamEventUtils', () => {
  test('shouldIgnoreStreamError matches settings-update failures', () => {
    expect(shouldIgnoreStreamError({ message: 'Failed to update settings: x' })).toBe(true);
    expect(shouldIgnoreStreamError({ content: 'Failed to update settings: y' })).toBe(true);
    expect(shouldIgnoreStreamError({ message: 'Different failure' })).toBe(false);
    expect(shouldIgnoreStreamError(undefined)).toBe(false);
  });

  test('buildScreenshotAttachment resolves URL from explicit url or artifact ref', () => {
    expect(
      buildScreenshotAttachment('artifact-123', 'https://cdn.example/override.png'),
    ).toEqual({
      screenshotRef: 'artifact-123',
      screenshotUrl: 'https://cdn.example/override.png',
    });

    expect(buildScreenshotAttachment('artifact-123')).toEqual({
      screenshotRef: 'artifact-123',
      screenshotUrl: expect.stringContaining('/api/artifacts/artifact-123'),
    });

    expect(buildScreenshotAttachment(null)).toEqual({
      screenshotRef: null,
      screenshotUrl: null,
    });
  });

  test('resolveToolOutputCorrelationId prioritizes request id then metadata then event id', () => {
    expect(
      resolveToolOutputCorrelationId({
        request_id: 'req-1',
        metadata: { request_id: 'meta-1' },
      }, 'event-1'),
    ).toBe('req-1');

    expect(
      resolveToolOutputCorrelationId({
        metadata: { request_id: 'meta-1' },
      }, 'event-1'),
    ).toBe('meta-1');

    expect(resolveToolOutputCorrelationId({}, 'event-1')).toBe('event-1');
    expect(resolveToolOutputCorrelationId({}, null)).toBeUndefined();
  });

  test('resolveErrorText prefers payload content then message then fallback', () => {
    expect(resolveErrorText({ content: 'content-error', message: 'message-error' })).toBe('content-error');
    expect(resolveErrorText({ content: '', message: 'message-error' })).toBe('message-error');
    expect(resolveErrorText({ content: '', message: '' })).toBe('An error occurred');
    expect(resolveErrorText(undefined)).toBe('An error occurred');
  });
});
