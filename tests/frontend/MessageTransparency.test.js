import { buildTransparencySectionConfigs } from '../../frontend/src/renderer/features/chat/utils/messageTransparency';

describe('messageTransparency utils', () => {
  test('returns empty list when message has no transparency payloads', () => {
    expect(buildTransparencySectionConfigs({ text: 'hello' })).toEqual([]);
  });

  test('builds section descriptors for all supported transparency payloads', () => {
    const metadata = { user_id: 'user-1' };
    const sections = buildTransparencySectionConfigs({
      systemPrompt: { content: 'prompt text' },
      toolSchemas: [{ type: 'function', function: { name: 'read_file', parameters: { type: 'object' } } }],
      fullUserMessage: { content: '<message/>', metadata },
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
    ]);

    expect(sections[2].metadata).not.toBe(metadata);
  });

  test('full user message metadata defaults to empty object', () => {
    const sections = buildTransparencySectionConfigs({
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
      toolSchemas: ['not-canonical'],
    });

    expect(sections).toEqual([]);
  });
});
