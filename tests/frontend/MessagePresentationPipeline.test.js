import {
  buildCurrentTurnResponseOverlayEntries,
  buildThreadPresentationMessages,
  hasCurrentTurnLiveProgressMessages,
} from '../../frontend/src/renderer/features/chat/utils/message/messagePresentationPipeline';

describe('messagePresentationPipeline', () => {
  test('buildThreadPresentationMessages keeps SDK row order even when tool logs are hidden', () => {
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

    expect(rendered).toBe(messages);
  });

  test('buildCurrentTurnResponseOverlayEntries includes live tool explanations only for tool calls', () => {
    const messages = [
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
    ];
    const entries = buildCurrentTurnResponseOverlayEntries(messages);

    expect(entries).toEqual([
      expect.objectContaining({
        id: 'tool-call-1:tool-explanation:0',
        type: 'tool-explanation',
        text: 'Search Python files for OCR-related code.',
      }),
    ]);
    expect(hasCurrentTurnLiveProgressMessages(messages)).toBe(true);
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

  test('keeps active tool-output rows visible while tool logs are collapsed', () => {
    const messages = [
      { id: 'user-1', sender: 'user', text: 'Read files' },
      {
        id: 'tool-call-1',
        sender: 'assistant',
        type: 'tool-call',
        text: 'raw tool call',
        sourceEventType: 'tool-call',
      },
      {
        id: 'tool-output-1',
        sender: 'assistant',
        type: 'tool-output',
        text: 'README contents',
        sourceEventType: 'tool-output',
      },
    ];

    expect(buildThreadPresentationMessages(messages, {
      showToolLogs: false,
      isBusy: true,
    })).toEqual(messages);
  });

  test('keeps completed raw tool-call rows while tool logs are collapsed', () => {
    const messages = [
      { id: 'user-1', sender: 'user', text: 'Read files' },
      {
        id: 'tool-call-1',
        sender: 'assistant',
        type: 'tool-call',
        text: 'raw tool call',
        sourceEventType: 'tool-call',
      },
      {
        id: 'tool-output-1',
        sender: 'assistant',
        type: 'tool-output',
        text: 'README contents',
        sourceEventType: 'tool-output',
      },
      {
        id: 'assistant-1',
        sender: 'assistant',
        type: 'llm-text',
        text: 'I read the file.',
        isComplete: true,
      },
    ];

    expect(buildThreadPresentationMessages(messages, {
      showToolLogs: false,
      isBusy: false,
    })).toBe(messages);
  });

  test('keeps completed tool-output rows while tool logs are collapsed', () => {
    const messages = [
      { id: 'user-1', sender: 'user', text: 'Read files' },
      {
        id: 'tool-output-1',
        sender: 'assistant',
        type: 'tool-output',
        text: 'README contents',
        sourceEventType: 'tool-output',
      },
      {
        id: 'assistant-1',
        sender: 'assistant',
        type: 'llm-text',
        text: 'I read the file.',
        isComplete: true,
      },
    ];

    expect(buildThreadPresentationMessages(messages, {
      showToolLogs: false,
      isBusy: false,
    })).toBe(messages);
  });

  test('current-turn live progress ignores progress rows before the latest user', () => {
    expect(hasCurrentTurnLiveProgressMessages([
      { id: 'user-1', sender: 'user', text: 'Search the web' },
      {
        id: 'search-1',
        sender: 'assistant',
        type: 'search-source',
        text: 'Searched example.com',
      },
      { id: 'user-2', sender: 'user', text: 'Now answer this' },
    ])).toBe(false);

    expect(hasCurrentTurnLiveProgressMessages([
      { id: 'user-1', sender: 'user', text: 'Search the web' },
      {
        id: 'search-1',
        sender: 'assistant',
        type: 'search-source',
        text: 'Searched example.com',
      },
      { id: 'user-2', sender: 'user', text: 'Now answer this' },
      {
        id: 'tool-call-2:tool-explanation:0',
        sender: 'assistant',
        type: 'tool-explanation',
        text: 'Read the latest file.',
      },
    ])).toBe(true);
  });
});
