import { buildMessageClassName } from '../../frontend/src/renderer/features/chat/utils/message/messageListClasses';

describe('buildMessageClassName', () => {
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

  test('includes message type and screenshot classes when present', () => {
    expect(
      buildMessageClassName({
        sender: 'assistant',
        type: 'tool-output',
        text: 'result',
        screenshotRef: 'artifact-123',
      }),
    ).toBe(
      'message message-assistant message-type-tool-output message-has-screenshot',
    );
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
