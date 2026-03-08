import {
  buildTransparencySectionConfigs,
  resolveConversationToolSchemas,
} from '../../frontend/src/renderer/features/chat/utils/message/messageTransparency';

describe('messageTransparency utils', () => {
  test('returns empty list when message has no transparency payloads', () => {
    expect(buildTransparencySectionConfigs({ text: 'hello' })).toEqual([]);
  });

  test('builds section descriptors for all supported transparency payloads', () => {
    const metadata = { user_id: 'user-1' };
    const sections = buildTransparencySectionConfigs({
      sender: 'user',
      systemPrompt: { content: 'prompt text' },
      toolSchemas: [{ type: 'function', function: { name: 'read_file', parameters: { type: 'object' } } }],
      fullUserMessage: { content: '<message/>', metadata },
      fullAssistantMessage: { content: '<assistant/>' },
    });

    expect(sections).toEqual([
      {
        key: 'system-prompt',
        title: 'System Prompt',
        content: 'prompt text',
        metadata: null,
        type: 'system-prompt',
      },
      {
        key: 'tool-schemas',
        title: 'Tool Schemas (Available Tools)',
        content: [{ type: 'function', function: { name: 'read_file', parameters: { type: 'object' } } }],
        type: 'json',
      },
      {
        key: 'user-message-full',
        title: 'Full Message Sent to Assistant (Complete)',
        content: '<message/>',
        metadata: { user_id: 'user-1' },
        type: 'xml',
      },
      {
        key: 'assistant-message-full',
        title: 'Full Assistant Message (Complete)',
        content: '<assistant/>',
        metadata: null,
        type: 'xml',
      },
    ]);

    expect(sections[2].metadata).not.toBe(metadata);
  });

  test('uses conversation-level tool schemas for later user messages', () => {
    const toolSchemas = [{ type: 'function', function: { name: 'read_file', parameters: { type: 'object' } } }];
    const sections = buildTransparencySectionConfigs({
      sender: 'user',
      fullUserMessage: { content: '<message />' },
    }, {
      conversationToolSchemas: toolSchemas,
    });

    expect(sections[0]).toEqual({
      key: 'tool-schemas',
      title: 'Tool Schemas (Available Tools)',
      content: toolSchemas,
      type: 'json',
    });
  });

  test('does not inject conversation-level tool schemas into assistant rows', () => {
    const toolSchemas = [{ type: 'function', function: { name: 'read_file', parameters: { type: 'object' } } }];
    const sections = buildTransparencySectionConfigs({
      sender: 'assistant',
      fullAssistantMessage: { content: '<assistant />' },
    }, {
      conversationToolSchemas: toolSchemas,
    });

    expect(sections).toEqual([
      {
        key: 'assistant-message-full',
        title: 'Full Assistant Message (Complete)',
        content: '<assistant />',
        metadata: null,
        type: 'xml',
      },
    ]);
  });

  test('full user message metadata defaults to empty object', () => {
    const sections = buildTransparencySectionConfigs({
      sender: 'user',
      fullUserMessage: { content: '<xml />' },
    });

    expect(sections).toEqual([
      {
        key: 'user-message-full',
        title: 'Full Message Sent to Assistant (Complete)',
        content: '<xml />',
        metadata: {},
        type: 'xml',
      },
    ]);
  });

  test('drops tool schemas section for non-canonical payload', () => {
    const sections = buildTransparencySectionConfigs({
      sender: 'user',
      toolSchemas: ['not-canonical'],
    });

    expect(sections).toEqual([]);
  });

  test('resolves conversation tool schemas from the latest canonical message payload', () => {
    const oldToolSchemas = [{ type: 'function', function: { name: 'old-tool', parameters: { type: 'object' } } }];
    const newToolSchemas = [{ type: 'function', function: { name: 'new-tool', parameters: { type: 'object' } } }];

    expect(resolveConversationToolSchemas([
      { sender: 'user', toolSchemas: oldToolSchemas },
      { sender: 'assistant', text: 'reply' },
      { sender: 'user', systemPrompt: { toolSchemas: newToolSchemas } },
    ])).toEqual(newToolSchemas);
  });
});
