import {
  DEFAULT_USER_ID,
  UNASSIGNED_CONVERSATION_KEY,
  buildConversationKey,
  formatModelLabel,
  formatTimestamp,
  parseMemoriesToMessages,
  parseMemoryContent,
  toTimestampValue,
} from '../../frontend/src/renderer/features/dashboard/utils/episodicMemoryUtils';

describe('episodicMemoryUtils', () => {
  test('exports expected constants', () => {
    expect(DEFAULT_USER_ID).toBe('default_user');
    expect(UNASSIGNED_CONVERSATION_KEY).toBe('__unassigned_conversation__');
  });

  test('formatTimestamp handles missing and invalid timestamps', () => {
    expect(formatTimestamp()).toBe('Unknown time');
    expect(formatTimestamp('not-a-date')).toBe('not-a-date');
  });

  test('formatTimestamp formats valid date-like strings', () => {
    const result = formatTimestamp('2026-01-01T00:00:00.000Z');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
    expect(result).not.toBe('2026-01-01T00:00:00.000Z');
  });

  test('parseMemoryContent returns empty list for empty legacy content', () => {
    expect(parseMemoryContent({ content: '  \n\t ' })).toEqual([]);
    expect(parseMemoryContent(null)).toEqual([]);
  });

  test('parseMemoryContent parses legacy User/Assistant transcript format', () => {
    const memory = {
      content: 'User: hello there\nAssistant: hi!',
    };
    expect(parseMemoryContent(memory)).toEqual([
      { sender: 'user', text: 'hello there', type: 'user' },
      { sender: 'assistant', text: 'hi!', type: 'llm-text' },
    ]);
  });

  test('parseMemoryContent role-based parsing for user keeps screenshot', () => {
    const memory = {
      content: 'user says hi',
      role: 'user',
      screenshot: 'user-shot',
    };
    expect(parseMemoryContent(memory)).toEqual([
      {
        sender: 'user',
        text: 'user says hi',
        type: 'llm-text',
        screenshot: 'user-shot',
        screenshotRef: null,
        screenshotUrl: null,
        screenshotContentType: null,
      },
    ]);
  });

  test('parseMemoryContent role-based parsing for assistant drops screenshot on llm-text', () => {
    const memory = {
      content: 'assistant answer',
      role: 'assistant',
      screenshot: 'assistant-shot',
    };
    expect(parseMemoryContent(memory)).toEqual([
      {
        sender: 'assistant',
        text: 'assistant answer',
        type: 'llm-text',
        screenshot: null,
        screenshotRef: null,
        screenshotUrl: null,
        screenshotContentType: null,
      },
    ]);
  });

  test('parseMemoryContent normalizes tool role and tool-bundle message type', () => {
    const memory = {
      content: 'bundle issued',
      role: 'tool',
      message_type: 'tool-bundle',
      metadata: { screenshot: 'tool-shot' },
    };
    expect(parseMemoryContent(memory)).toEqual([
      {
        sender: 'assistant',
        text: 'bundle issued',
        type: 'tool-call',
        screenshot: null,
        screenshotRef: null,
        screenshotUrl: null,
        screenshotContentType: null,
      },
    ]);
  });

  test('parseMemoryContent keeps screenshot for tool-output role messages', () => {
    const memory = {
      content: 'tool output text',
      role: 'tool',
      metadata: { screenshot: 'tool-shot' },
    };
    expect(parseMemoryContent(memory)).toEqual([
      {
        sender: 'assistant',
        text: 'tool output text',
        type: 'tool-output',
        screenshot: 'tool-shot',
        screenshotRef: null,
        screenshotUrl: null,
        screenshotContentType: null,
      },
    ]);
  });

  test('parseMemoryContent falls back to assistant llm-text for generic content', () => {
    expect(parseMemoryContent({ content: 'plain message' })).toEqual([
      { sender: 'assistant', text: 'plain message', type: 'llm-text' },
    ]);
  });

  test('buildConversationKey composes record kind and conversation id', () => {
    expect(buildConversationKey({ record_kind: 'transcript', conversation_id: 'conv-1' })).toBe(
      'transcript::conv-1',
    );
    expect(buildConversationKey({})).toBe(`memory::${UNASSIGNED_CONVERSATION_KEY}`);
  });

  test('toTimestampValue returns 0 for invalid values', () => {
    expect(toTimestampValue()).toBe(0);
    expect(toTimestampValue('invalid-time')).toBe(0);
  });

  test('toTimestampValue returns epoch millis for valid timestamps', () => {
    expect(toTimestampValue('2026-01-01T00:00:00.000Z')).toBe(1767225600000);
  });

  test('formatModelLabel prefers provider/model pair then partials then unknown', () => {
    expect(formatModelLabel({ model_provider: 'openai', model_id: 'gpt-5.1' })).toBe('openai/gpt-5.1');
    expect(formatModelLabel({ model_id: 'gpt-5.1' })).toBe('gpt-5.1');
    expect(formatModelLabel({ model_provider: 'openai' })).toBe('openai');
    expect(formatModelLabel({})).toBe('Unknown model');
    expect(formatModelLabel(null)).toBe('Unknown model');
  });

  test('parseMemoriesToMessages flattens parsed parts into chat messages', () => {
    const memories = [
      { id: 'm1', content: 'User: hi\nAssistant: hello' },
      { id: 'm2', content: 'plain' },
    ];

    expect(parseMemoriesToMessages(memories)).toEqual([
      {
        id: 'm1-0',
        text: 'hi',
        sender: 'user',
        type: 'user',
        isComplete: true,
      },
      {
        id: 'm1-1',
        text: 'hello',
        sender: 'assistant',
        type: 'llm-text',
        isComplete: true,
      },
      {
        id: 'm2-0',
        text: 'plain',
        sender: 'assistant',
        type: 'llm-text',
        isComplete: true,
      },
    ]);
  });

  test('parseMemoriesToMessages falls back to index-based IDs when memory id missing', () => {
    const messages = parseMemoriesToMessages([{ content: 'plain text' }]);
    expect(messages).toEqual([
      {
        id: '0-0',
        text: 'plain text',
        sender: 'assistant',
        type: 'llm-text',
        isComplete: true,
      },
    ]);
  });

  test('parseMemoriesToMessages maps transcript screenshot value to screenshotRef', () => {
    const messages = parseMemoriesToMessages([
      {
        id: 'tool-1',
        role: 'tool',
        message_type: 'tool-output',
        content: 'tool output',
        screenshot: 'artifact-123',
        record_kind: 'transcript',
      },
    ]);

    expect(messages).toEqual([
      {
        id: 'tool-1-0',
        text: 'tool output',
        sender: 'assistant',
        type: 'tool-output',
        screenshotRef: 'artifact-123',
        isComplete: true,
      },
    ]);
  });
});
