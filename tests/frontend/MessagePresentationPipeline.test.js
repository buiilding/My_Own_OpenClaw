import {
  buildCurrentTurnResponseOverlayEntries,
  buildThreadPresentationMessages,
} from '../../frontend/src/renderer/features/chat/utils/message/messagePresentationPipeline';

describe('messagePresentationPipeline', () => {
  test('buildThreadPresentationMessages collapses completed hidden tool rows into a summary before assistant text', () => {
    const messages = [
      { id: 'user-1', sender: 'user', text: 'Inspect workspace' },
      {
        id: 'tool-call-1',
        sender: 'assistant',
        text: 'raw tool call',
        type: 'tool-call',
        sourceEventType: 'tool-call',
        toolCallDetails: {
          parameters: {
            tool: 'run_shell_command',
            explanation: 'List the active workspace contents.',
          },
        },
      },
      {
        id: 'assistant-1',
        sender: 'assistant',
        text: 'The workspace contains src and tests.',
        type: 'llm-text',
        isComplete: true,
      },
    ];

    const rendered = buildThreadPresentationMessages(messages, {
      showToolLogs: false,
      isBusy: false,
    });

    expect(rendered.map((message) => message.type || 'llm-text')).toEqual([
      'llm-text',
      'tool-actions-summary',
      'llm-text',
    ]);
    expect(rendered[1].actionExplanations).toEqual([
      'List the active workspace contents.',
    ]);
  });

  test('buildCurrentTurnResponseOverlayEntries includes live tool explanations only for tool calls', () => {
    const entries = buildCurrentTurnResponseOverlayEntries([
      { id: 'user-1', sender: 'user', text: 'Find OCR code' },
      {
        id: 'tool-call-1',
        sender: 'assistant',
        type: 'tool-call',
        text: 'raw tool call',
        toolCallDetails: {
          parameters: {
            tool: 'run_shell_command',
            explanation: 'Search Python files for OCR-related code.',
          },
        },
      },
    ]);

    expect(entries).toEqual([
      expect.objectContaining({
        id: 'tool-call-1:tool-explanation:0',
        type: 'tool-explanation',
        text: 'Search Python files for OCR-related code.',
      }),
    ]);
  });

  test('keeps live search-source rows visible in overlay and hidden-thread presentation', () => {
    const messages = [
      { id: 'user-1', sender: 'user', text: 'Search the web' },
      {
        id: 'search-1',
        sender: 'assistant',
        type: 'search-source',
        text: 'Searched youtube.com',
        sourceEventType: 'web-search-progress',
      },
    ];

    expect(buildCurrentTurnResponseOverlayEntries(messages)).toEqual([
      expect.objectContaining({
        id: 'search-1',
        type: 'search-source',
        text: 'Searched youtube.com',
      }),
    ]);

    expect(buildThreadPresentationMessages(messages, {
      showToolLogs: false,
      isBusy: true,
    })).toEqual(messages);
  });
});
