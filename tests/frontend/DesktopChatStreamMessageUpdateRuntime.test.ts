/**
 * Covers desktop chat stream message update runtime behavior in the frontend test suite.
 */

import { DesktopChatStreamMessageUpdateRuntime } from '../../frontend/src/renderer/app/runtime/desktopChatStreamMessageUpdateRuntime';

const {
  buildAssistantMessageFullUpdate,
  buildSystemPromptUpdate,
  buildUserMessageFullUpdate,
  findLastAssistantLlmTextMessageId,
  findLastMessageIdBySender,
} = DesktopChatStreamMessageUpdateRuntime;

describe('desktopChatStreamMessageUpdateRuntime', () => {
  const messages = [
    { id: 'u1', sender: 'user', text: 'hello', turnRef: 'turn-1' },
    { id: 'a1', sender: 'assistant', text: 'one', type: 'llm-text', isComplete: true, turnRef: 'turn-1' },
    { id: 'u2', sender: 'user', text: 'again', turnRef: 'turn-2' },
    { id: 'a2', sender: 'assistant', text: 'two', type: 'tool-output', turnRef: 'turn-2' },
    { id: 'a3', sender: 'assistant', text: 'three', type: 'llm-text', isComplete: false, turnRef: 'turn-2' },
  ] as any;

  test('findLastMessageIdBySender selects expected ids', () => {
    expect(findLastMessageIdBySender(messages, 'user')).toBe('u2');
    expect(findLastMessageIdBySender(messages, 'assistant')).toBe('a3');
    expect(findLastMessageIdBySender(messages, 'assistant', 'turn-1')).toBe('a1');
    expect(findLastMessageIdBySender(messages, 'assistant', 'turn-3')).toBeNull();
    expect(findLastAssistantLlmTextMessageId(messages, 'turn-2')).toBe('a3');
  });

  test('payload update builders normalize missing or non-string content', () => {
    expect(
      buildSystemPromptUpdate({
        content: 'prompt',
        tool_schemas: [{ type: 'function', function: { name: 'read_file', parameters: { type: 'object' } } }],
      }),
    ).toEqual({
      content: 'prompt',
      toolSchemas: [{ type: 'function', function: { name: 'read_file', parameters: { type: 'object' } } }],
    });
    expect(
      buildSystemPromptUpdate({
        content: 'prompt',
        tool_schemas: [{ type: 'function', name: 'run_shell_command', parameters: { type: 'object' } }],
      }),
    ).toEqual({
      content: 'prompt',
      toolSchemas: [{ type: 'function', function: { name: 'run_shell_command', parameters: { type: 'object' } } }],
    });
    expect(buildSystemPromptUpdate({ content: 'prompt', tool_schemas: ['a'] })).toEqual({
      content: 'prompt',
      toolSchemas: undefined,
    });
    expect(buildSystemPromptUpdate({ content: 5 as any })).toEqual({
      content: '',
      toolSchemas: undefined,
    });

    expect(buildUserMessageFullUpdate({ content: 'u', metadata: { x: 1 } })).toEqual({
      content: 'u',
      metadata: { x: 1 },
    });
    expect(buildUserMessageFullUpdate({ content: null as any })).toEqual({
      content: '',
      metadata: undefined,
    });

    expect(buildAssistantMessageFullUpdate({ content: 'a' })).toEqual({ content: 'a' });
    expect(buildAssistantMessageFullUpdate({ content: false as any })).toEqual({ content: '' });
  });

  test('normalizes mojibake and lone surrogates in streaming and payload updates', () => {
    expect(buildUserMessageFullUpdate({ content: 'bad\udc9d' })).toEqual({
      content: 'bad�',
      metadata: undefined,
    });

    expect(buildSystemPromptUpdate({
      content: 'Active: â€œProject Alpha â€” READMEâ€\u009d',
      tool_schemas: [],
    })).toEqual({
      content: 'Active: “Project Alpha — README”',
      toolSchemas: [],
    });

    expect(buildAssistantMessageFullUpdate({
      content: 'Done\udc9d',
    })).toEqual({
      content: 'Done�',
    });
  });

  test('preserves valid emoji surrogate pairs while replacing lone surrogates', () => {
    expect(buildUserMessageFullUpdate({ content: 'Hey! 👋' })).toEqual({
      content: 'Hey! 👋',
      metadata: undefined,
    });

    expect(buildAssistantMessageFullUpdate({
      content: 'Wave 👋 then lone \udc9d',
    })).toEqual({
      content: 'Wave 👋 then lone \uFFFD',
    });
  });
});
