/**
 * Covers desktop message class runtime behavior in the frontend test suite.
 */

import { DesktopMessageClassRuntime } from '../../src/renderer/app/runtime/desktopMessageClassRuntime';

describe('desktopMessageClassRuntime', () => {
  const { buildMessageClassName } = DesktopMessageClassRuntime;

  test('builds base user message class names', () => {
    expect(
      buildMessageClassName({
        sender: 'user',
        text: 'hello',
      }),
    ).toBe('message message-user');
  });

  test('includes streaming class for incomplete assistant messages', () => {
    expect(
      buildMessageClassName({
        sender: 'assistant',
        isComplete: false,
        text: 'typing',
      }),
    ).toBe('message message-assistant message-streaming');
  });

  test('includes message type and screenshot classes for typed ready attachments', () => {
    expect(
      buildMessageClassName({
        sender: 'assistant',
        type: 'tool-output',
        text: 'result',
        attachments: [{
          id: 'tool-output:attachment:000',
          kind: 'image',
          source: 'tool_result',
          status: 'ready',
          screenshotRef: 'artifact-123',
        }],
      }),
    ).toBe(
      'message message-assistant message-type-tool-output message-has-screenshot',
    );
  });

  test('does not include screenshot class for legacy screenshot aliases alone', () => {
    expect(
      buildMessageClassName({
        sender: 'assistant',
        type: 'tool-output',
        text: 'result',
        screenshotRef: 'artifact-123',
      }),
    ).toBe('message message-assistant message-type-tool-output');
  });

  test('does not include streaming class for complete assistant messages', () => {
    expect(
      buildMessageClassName({
        sender: 'assistant',
        isComplete: true,
        text: 'done',
      }),
    ).toBe('message message-assistant');
  });
});
