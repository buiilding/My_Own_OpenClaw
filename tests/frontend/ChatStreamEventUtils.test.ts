import {
  buildScreenshotAttachment,
  buildScreenshotAttachments,
  resolveErrorText,
  resolveToolCallCorrelationId,
  resolveToolOutputCorrelationId,
  shouldIgnoreStreamError,
} from '../../frontend/src/renderer/features/chat/utils/chatStream/chatStreamEventUtils';

describe('chatStreamEventUtils', () => {
  test('shouldIgnoreStreamError matches settings-update failures', () => {
    expect(shouldIgnoreStreamError({ message: 'Failed to update settings: x' })).toBe(true);
    expect(shouldIgnoreStreamError({ content: 'Failed to update settings: y' })).toBe(true);
    expect(shouldIgnoreStreamError({ message: 'Different failure' })).toBe(false);
    expect(shouldIgnoreStreamError(undefined)).toBe(false);
  });

  test('shouldIgnoreStreamError matches recoverable streamed tool-call parse failures', () => {
    expect(shouldIgnoreStreamError({
      content: (
        'Unexpected system error: Invalid response from stream: '
        + 'failed to parse streamed tool-call arguments for id=tool_bad name=run_shell_command. '
        + 'Raw arguments preview: \'{"command":"cat > index.html << \\"EOF\\""}\''
      ),
    })).toBe(true);
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

    expect(buildScreenshotAttachment('   ', '   ')).toEqual({
      screenshotRef: null,
      screenshotUrl: null,
    });
  });

  test('buildScreenshotAttachments normalizes trimmed refs and drops whitespace entries', () => {
    expect(
      buildScreenshotAttachments(
        [' artifact-1 ', '   ', null, 'artifact-2'],
        ' https://cdn.example/override.png ',
      ),
    ).toEqual([
      { screenshotRef: 'artifact-1', screenshotUrl: 'https://cdn.example/override.png' },
      { screenshotRef: 'artifact-2', screenshotUrl: expect.stringContaining('/api/artifacts/artifact-2') },
    ]);

    expect(buildScreenshotAttachments(['   ', null], '   ')).toEqual([]);
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
    expect(resolveToolOutputCorrelationId({ request_id: '   ', metadata: { request_id: ' meta-2 ' } }, 'event-1')).toBe('meta-2');
    expect(resolveToolOutputCorrelationId({ request_id: '   ', metadata: { request_id: '   ' } }, ' event-2 ')).toBe('event-2');
  });

  test('resolveToolCallCorrelationId normalizes correlation/request ids', () => {
    expect(resolveToolCallCorrelationId({
      correlation_id: ' corr-1 ',
      request_id: 'req-1',
    })).toBe('corr-1');

    expect(resolveToolCallCorrelationId({
      correlation_id: '   ',
      request_id: ' req-2 ',
    })).toBe('req-2');

    expect(resolveToolCallCorrelationId({
      correlation_id: '   ',
      request_id: '   ',
    })).toBeUndefined();
  });

  test('resolveErrorText prefers payload content then message then fallback', () => {
    expect(resolveErrorText({ content: 'content-error', message: 'message-error' })).toBe('content-error');
    expect(resolveErrorText({ content: '', message: 'message-error' })).toBe('message-error');
    expect(resolveErrorText({ content: '', message: '' })).toBe('An error occurred');
    expect(resolveErrorText(undefined)).toBe('An error occurred');
  });
});
