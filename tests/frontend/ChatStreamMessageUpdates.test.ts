import {
  buildAssistantMessageFullUpdate,
  buildSystemPromptUpdate,
  buildUserMessageFullUpdate,
  findFirstMessageIdBySender,
  findLastMessageIdBySender,
  findStreamingCompleteAssistantMessage,
  resolveStreamingResponseAction,
} from '../../frontend/src/renderer/features/chat/utils/chatStreamMessageUpdates';

describe('chatStreamMessageUpdates', () => {
  const messages = [
    { id: 'u1', sender: 'user', text: 'hello' },
    { id: 'a1', sender: 'assistant', text: 'one', type: 'llm-text', isComplete: true },
    { id: 'u2', sender: 'user', text: 'again' },
    { id: 'a2', sender: 'assistant', text: 'two', type: 'tool-output' },
    { id: 'a3', sender: 'assistant', text: 'three', type: 'llm-text', isComplete: false },
  ] as any;

  test('findLastMessageIdBySender and findFirstMessageIdBySender select expected ids', () => {
    expect(findFirstMessageIdBySender(messages, 'user')).toBe('u1');
    expect(findLastMessageIdBySender(messages, 'user')).toBe('u2');
    expect(findFirstMessageIdBySender(messages, 'assistant')).toBe('a1');
    expect(findLastMessageIdBySender(messages, 'assistant')).toBe('a3');
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
    });
  });

  test('findStreamingCompleteAssistantMessage returns last assistant llm-text candidate', () => {
    expect(findStreamingCompleteAssistantMessage(messages)?.id).toBe('a3');
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
});
