import {
  DEFAULT_USER_ID,
  parseMemoriesToMessages,
} from '../../frontend/src/renderer/features/dashboard/utils/episodicMemoryUtils';

describe('episodicMemoryUtils', () => {
  test('exports expected constants', () => {
    expect(DEFAULT_USER_ID).toBe('default_user');
  });

  test('parseMemoriesToMessages drops empty legacy content payloads', () => {
    expect(parseMemoriesToMessages([{ content: '  \n\t ' }])).toEqual([]);
    expect(parseMemoriesToMessages([])).toEqual([]);
  });

  test('parseMemoriesToMessages parses legacy User/Assistant transcript format', () => {
    const memory = {
      id: 'legacy',
      content: 'User: hello there\nAssistant: hi!',
    };
    expect(parseMemoriesToMessages([memory])).toEqual([
      {
        id: 'legacy-0',
        sender: 'user',
        text: 'hello there',
        type: 'user',
        isComplete: true,
      },
      {
        id: 'legacy-1',
        sender: 'assistant',
        text: 'hi!',
        type: 'llm-text',
        isComplete: true,
      },
    ]);
  });

  test('parseMemoriesToMessages role-based parsing for user keeps screenshot', () => {
    const memory = {
      id: 'role-user',
      content: 'user says hi',
      role: 'user',
      screenshot: 'user-shot',
    };
    expect(parseMemoriesToMessages([memory])).toEqual([
      {
        id: 'role-user-0',
        sender: 'user',
        text: 'user says hi',
        type: 'llm-text',
        screenshot: 'user-shot',
        isComplete: true,
      },
    ]);
  });

  test('parseMemoriesToMessages role-based parsing for assistant drops screenshot on llm-text', () => {
    const memory = {
      id: 'role-assistant',
      content: 'assistant answer',
      role: 'assistant',
      screenshot: 'assistant-shot',
    };
    expect(parseMemoriesToMessages([memory])).toEqual([
      {
        id: 'role-assistant-0',
        sender: 'assistant',
        text: 'assistant answer',
        type: 'llm-text',
        isComplete: true,
      },
    ]);
  });

  test('parseMemoriesToMessages normalizes tool role and tool-bundle message type', () => {
    const memory = {
      id: 'tool-bundle',
      content: 'bundle issued',
      role: 'tool',
      message_type: 'tool-bundle',
      metadata: { screenshot: 'tool-shot' },
    };
    expect(parseMemoriesToMessages([memory])).toEqual([
      {
        id: 'tool-bundle-0',
        sender: 'assistant',
        text: 'bundle issued',
        type: 'tool-call',
        isComplete: true,
      },
    ]);
  });

  test('parseMemoriesToMessages keeps screenshot for tool-output role messages', () => {
    const memory = {
      id: 'tool-output',
      content: 'tool output text',
      role: 'tool',
      metadata: { screenshot: 'tool-shot' },
    };
    expect(parseMemoriesToMessages([memory])).toEqual([
      {
        id: 'tool-output-0',
        sender: 'assistant',
        text: 'tool output text',
        type: 'tool-output',
        screenshot: 'tool-shot',
        isComplete: true,
      },
    ]);
  });

  test('parseMemoriesToMessages falls back to assistant llm-text for generic content', () => {
    expect(parseMemoriesToMessages([{ id: 'plain', content: 'plain message' }])).toEqual([
      {
        id: 'plain-0',
        sender: 'assistant',
        text: 'plain message',
        type: 'llm-text',
        isComplete: true,
      },
    ]);
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
