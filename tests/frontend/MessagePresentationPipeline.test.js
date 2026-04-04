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

  test('buildCurrentTurnResponseOverlayEntries shows generic in-progress web search status', () => {
    const entries = buildCurrentTurnResponseOverlayEntries([
      { id: 'user-1', sender: 'user', text: 'Search the web' },
      {
        id: 'tool-call-web-search-1',
        sender: 'assistant',
        type: 'tool-call',
        text: 'raw tool call',
        correlationId: 'req-web-search-1',
        modelFacingToolCall: {
          name: 'web_search',
          arguments: {
            query: 'computer use OpenAI',
          },
        },
        toolCallDetails: {
          tool_name: 'web_search',
          request_id: 'req-web-search-1',
          parameters: {
            query: 'computer use OpenAI',
          },
        },
      },
    ]);

    expect(entries).toEqual([
      expect.objectContaining({
        id: 'tool-call-web-search-1:tool-explanation:0',
        type: 'tool-explanation',
        text: 'Searching the web',
      }),
    ]);
  });

  test('buildCurrentTurnResponseOverlayEntries replaces active web search status with completed query detail', () => {
    const entries = buildCurrentTurnResponseOverlayEntries([
      { id: 'user-1', sender: 'user', text: 'Search the web' },
      {
        id: 'tool-call-web-search-1',
        sender: 'assistant',
        type: 'tool-call',
        text: 'raw tool call',
        correlationId: 'req-web-search-1',
        modelFacingToolCall: {
          name: 'web_search',
          arguments: {
            query: 'computer use OpenAI',
          },
        },
        toolCallDetails: {
          tool_name: 'web_search',
          request_id: 'req-web-search-1',
          parameters: {
            query: 'computer use OpenAI',
          },
        },
      },
      {
        id: 'tool-output-web-search-1',
        sender: 'assistant',
        type: 'tool-output',
        text: 'search results',
        toolName: 'web_search',
        correlationId: 'req-web-search-1',
        toolOutputDetails: {
          tool_name: 'web_search',
          metadata: {
            request_id: 'req-web-search-1',
          },
        },
      },
    ]);

    expect(entries).toEqual([
      expect.objectContaining({
        id: 'tool-output-web-search-1:tool-explanation:0',
        type: 'tool-explanation',
        text: 'Searched web for computer use OpenAI',
      }),
    ]);
  });

  test('buildThreadPresentationMessages collapses completed web search rows into a summary before assistant text', () => {
    const messages = [
      { id: 'user-1', sender: 'user', text: 'Search the web' },
      {
        id: 'tool-call-web-search-1',
        sender: 'assistant',
        type: 'tool-call',
        text: 'raw tool call',
        correlationId: 'req-web-search-1',
        modelFacingToolCall: {
          name: 'web_search',
          arguments: {
            query: 'computer use OpenAI',
          },
        },
        toolCallDetails: {
          tool_name: 'web_search',
          request_id: 'req-web-search-1',
          parameters: {
            query: 'computer use OpenAI',
          },
        },
      },
      {
        id: 'tool-output-web-search-1',
        sender: 'assistant',
        type: 'tool-output',
        text: 'search results',
        toolName: 'web_search',
        correlationId: 'req-web-search-1',
        toolOutputDetails: {
          tool_name: 'web_search',
          metadata: {
            request_id: 'req-web-search-1',
          },
        },
      },
      {
        id: 'assistant-1',
        sender: 'assistant',
        text: 'Here is what I found.',
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
      'Searched web for computer use OpenAI',
    ]);
  });
});
