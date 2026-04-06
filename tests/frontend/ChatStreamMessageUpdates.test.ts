import {
  buildAssistantMessageFullUpdate,
  buildSystemPromptUpdate,
  buildUserMessageFullUpdate,
  findLastAssistantLlmTextMessageId,
  findFirstMessageIdBySender,
  findLastMessageIdBySender,
  findStreamingCompleteAssistantMessage,
  resolveStreamingResponseAction,
} from '../../frontend/src/renderer/features/chat/utils/chatStream/chatStreamMessageUpdates';

describe('chatStreamMessageUpdates', () => {
  const messages = [
    { id: 'u1', sender: 'user', text: 'hello', turnRef: 'turn-1' },
    { id: 'a1', sender: 'assistant', text: 'one', type: 'llm-text', isComplete: true, turnRef: 'turn-1' },
    { id: 'u2', sender: 'user', text: 'again', turnRef: 'turn-2' },
    { id: 'a2', sender: 'assistant', text: 'two', type: 'tool-output', turnRef: 'turn-2' },
    { id: 'a3', sender: 'assistant', text: 'three', type: 'llm-text', isComplete: false, turnRef: 'turn-2' },
  ] as any;

  test('findLastMessageIdBySender and findFirstMessageIdBySender select expected ids', () => {
    expect(findFirstMessageIdBySender(messages, 'user')).toBe('u1');
    expect(findLastMessageIdBySender(messages, 'user')).toBe('u2');
    expect(findFirstMessageIdBySender(messages, 'assistant')).toBe('a1');
    expect(findLastMessageIdBySender(messages, 'assistant')).toBe('a3');
    expect(findLastMessageIdBySender(messages, 'assistant', 'turn-1')).toBe('a1');
    expect(findLastMessageIdBySender(messages, 'assistant', 'turn-3')).toBeNull();
    expect(findLastAssistantLlmTextMessageId(messages, 'turn-2')).toBe('a3');
    expect(findFirstMessageIdBySender([], 'assistant')).toBeNull();
  });

  test('resolveStreamingResponseAction appends when last assistant llm-text is incomplete', () => {
    expect(resolveStreamingResponseAction(messages, ' +chunk')).toEqual({
      type: 'append',
      messageId: 'a3',
      nextText: 'three +chunk',
    });
  });

  test('resolveStreamingResponseAction creates new message action when append conditions fail', () => {
    expect(
      resolveStreamingResponseAction(
        [{ id: 'a1', sender: 'assistant', text: 'done', type: 'llm-text', isComplete: true } as any],
        'fresh',
      ),
    ).toEqual({
      type: 'new',
      text: 'fresh',
    });

    expect(resolveStreamingResponseAction([], undefined)).toEqual({
      type: 'new',
      text: '',
      turnRef: undefined,
    });

    expect(resolveStreamingResponseAction(messages, 'fresh', 'turn-9')).toEqual({
      type: 'new',
      text: 'fresh',
      turnRef: 'turn-9',
    });

    expect(resolveStreamingResponseAction([
      { id: 'a1', sender: 'assistant', text: 'preface', type: 'llm-text', isComplete: false, turnRef: 'turn-1' },
      { id: 't1', sender: 'assistant', text: '{}', type: 'tool-output', turnRef: 'turn-1' },
    ] as any, 'final', 'turn-1')).toEqual({
      type: 'new',
      text: 'final',
      turnRef: 'turn-1',
    });
  });

  test('findStreamingCompleteAssistantMessage returns last assistant llm-text candidate', () => {
    expect(findStreamingCompleteAssistantMessage(messages)?.id).toBe('a3');
    expect(findStreamingCompleteAssistantMessage(messages, 'turn-1')?.id).toBe('a1');
    expect(findStreamingCompleteAssistantMessage(messages, 'turn-missing')).toBeNull();
    expect(
      findStreamingCompleteAssistantMessage([
        { id: 't1', sender: 'assistant', text: 'tool', type: 'tool-output' },
      ] as any),
    ).toBeNull();
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
    expect(resolveStreamingResponseAction([], 'bad\udc9d')).toEqual({
      type: 'new',
      text: 'bad�',
      turnRef: undefined,
    });

    expect(buildSystemPromptUpdate({
      content: 'Active: â€œWindieOS â€” READMEâ€\u009d',
      tool_schemas: [],
    })).toEqual({
      content: 'Active: “WindieOS — README”',
      toolSchemas: [],
    });

    expect(buildAssistantMessageFullUpdate({
      content: 'Done\udc9d',
    })).toEqual({
      content: 'Done�',
    });
  });

  test('preserves valid emoji surrogate pairs while replacing lone surrogates', () => {
    expect(resolveStreamingResponseAction([], 'Hey! 👋')).toEqual({
      type: 'new',
      text: 'Hey! 👋',
      turnRef: undefined,
    });

    expect(buildAssistantMessageFullUpdate({
      content: 'Wave 👋 then lone \udc9d',
    })).toEqual({
      content: 'Wave 👋 then lone \uFFFD',
    });
  });
});
