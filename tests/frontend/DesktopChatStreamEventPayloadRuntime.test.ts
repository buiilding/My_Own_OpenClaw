/**
 * Covers desktop chat stream event payload runtime behavior in the frontend test suite.
 */

import {
  buildScreenshotAttachment,
  resolveErrorText,
  shouldIgnoreStreamError,
} from '../../frontend/src/renderer/app/runtime/desktopChatStreamEventPayloadRuntime';

describe('desktopChatStreamEventPayloadRuntime', () => {
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

  test('resolveErrorText prefers payload content then message then fallback', () => {
    expect(resolveErrorText({ content: 'content-error', message: 'message-error' })).toBe('content-error');
    expect(resolveErrorText({ content: '', message: 'message-error' })).toBe('message-error');
    expect(resolveErrorText({ content: '', message: '' })).toBe('An error occurred');
    expect(resolveErrorText(undefined)).toBe('An error occurred');
  });
});
