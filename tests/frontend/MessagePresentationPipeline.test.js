/**
 * Covers message presentation pipeline. behavior in the frontend test suite.
 */

import {
  DesktopThreadPresentationRuntime,
} from '../../frontend/src/renderer/app/runtime/desktopThreadPresentationRuntime';

const {
  buildThreadPresentationMessages,
} = DesktopThreadPresentationRuntime;

describe('desktopThreadPresentationRuntime', () => {
  test('buildThreadPresentationMessages keeps durable row order without tool-log filtering', () => {
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

    const rendered = buildThreadPresentationMessages(messages);

    expect(rendered).toBe(messages);
  });

  test('buildThreadPresentationMessages inserts current-turn tool rows after the active user', () => {
    const messages = [
      { id: 'user-1', sender: 'user', text: 'Inspect workspace' },
    ];
    const sdkLiveTurn = {
      conversationRef: 'conv-1',
      turnRef: 'turn-1',
      phase: 'tool_call',
      presentation: {
        entries: [{
          id: 'projected-tool-1',
          type: 'tool-call',
          text: 'tool call',
        }],
      },
    };

    expect(buildThreadPresentationMessages(messages, {
      sdkLiveTurn,
      activeConversationRef: 'conv-1',
    })).toEqual([
      messages[0],
      expect.objectContaining({
        id: 'projected-tool-1',
        sender: 'assistant',
        type: 'tool-call',
        sourceChannel: 'sdk:current-turn',
        turnRef: 'turn-1',
      }),
    ]);
  });

  test('buildThreadPresentationMessages inserts current-turn thinking after durable same-turn rows', () => {
    const messages = [
      { id: 'user-1', sender: 'user', text: 'Inspect workspace', turnRef: 'turn-1' },
      {
        id: 'tool-call-1',
        sender: 'assistant',
        text: 'Reading README.md',
        type: 'tool-call',
        turnRef: 'turn-1',
      },
    ];
    const sdkLiveTurn = {
      conversationRef: 'conv-1',
      turnRef: 'turn-1',
      phase: 'streaming',
      presentation: {
        entries: [{
          id: 'conv-1:turn-1:thinking',
          type: 'thinking',
          text: 'Checking the project structure.',
        }],
      },
    };

    expect(buildThreadPresentationMessages(messages, {
      sdkLiveTurn,
      activeConversationRef: 'conv-1',
    })).toEqual([
      messages[0],
      messages[1],
      expect.objectContaining({
        id: 'conv-1:turn-1:thinking',
        sender: 'assistant',
        text: '',
        type: 'llm-text',
        thinkingText: 'Checking the project structure.',
        sourceChannel: 'sdk:current-turn',
        turnRef: 'turn-1',
      }),
    ]);
  });

  test('buildThreadPresentationMessages renders SDK presentation entries as live chat rows', () => {
    const messages = [
      { id: 'user-1', sender: 'user', text: 'Inspect workspace', turnRef: 'turn-1' },
    ];
    const sdkLiveTurn = {
      conversationRef: 'conv-1',
      turnRef: 'turn-1',
      phase: 'streaming',
      assistantText: 'Projected answer',
      reasoningText: 'Thinking about files.',
      toolEvents: [],
      lastError: null,
      presentation: {
        entries: [
          {
            id: 'conv-1:turn-1:thinking',
            type: 'thinking',
            text: 'Thinking about files.',
            sourceEventType: 'reasoning_delta',
            sourceChannel: 'sdk:current-turn',
            turnRef: 'turn-1',
          },
          {
            id: 'conv-1:turn-1:assistant',
            type: 'llm-text',
            text: 'Projected answer',
            sourceEventType: 'assistant_delta',
            sourceChannel: 'sdk:current-turn',
            turnRef: 'turn-1',
          },
        ],
      },
    };

    expect(buildThreadPresentationMessages(messages, {
      sdkLiveTurn,
      activeConversationRef: 'conv-1',
    })).toEqual([
      messages[0],
      expect.objectContaining({
        id: 'conv-1:turn-1:thinking',
        sender: 'assistant',
        text: '',
        thinkingText: 'Thinking about files.',
      }),
      expect.objectContaining({
        id: 'conv-1:turn-1:assistant',
        sender: 'assistant',
        text: 'Projected answer',
      }),
    ]);
  });

  test('buildThreadPresentationMessages derives current-turn rows from projection fallback', () => {
    const messages = [
      { id: 'user-1', sender: 'user', text: 'Inspect workspace', turnRef: 'turn-1' },
    ];
    const sdkLiveTurn = {
      conversationRef: 'conv-1',
      turnRef: 'turn-1',
      phase: 'streaming',
      assistantText: 'Projected answer',
      reasoningText: 'Thinking about files.',
      toolEvents: [],
      lastError: null,
      presentation: {
        entries: [],
      },
    };

    expect(buildThreadPresentationMessages(messages, {
      sdkLiveTurn,
      activeConversationRef: 'conv-1',
    })).toEqual([
      messages[0],
      expect.objectContaining({
        id: 'conv-1:turn-1:assistant',
        sender: 'assistant',
        text: 'Projected answer',
        thinkingText: 'Thinking about files.',
        sourceChannel: 'sdk:current-turn',
      }),
    ]);
  });

  test('buildThreadPresentationMessages prefers SDK presentation entries over projection fallback rows', () => {
    const messages = [
      { id: 'user-1', sender: 'user', text: 'Inspect workspace', turnRef: 'turn-1' },
    ];
    const sdkLiveTurn = {
      conversationRef: 'conv-1',
      turnRef: 'turn-1',
      phase: 'streaming',
      assistantText: 'Legacy answer',
      reasoningText: null,
      toolEvents: [],
      lastError: null,
      presentation: {
        entries: [{
          id: 'conv-1:turn-1:assistant:presentation',
          type: 'llm-text',
          text: 'Presentation answer',
          sourceEventType: 'assistant_delta',
          sourceChannel: 'sdk:current-turn',
          turnRef: 'turn-1',
        }],
      },
    };

    expect(buildThreadPresentationMessages(messages, {
      sdkLiveTurn,
      activeConversationRef: 'conv-1',
    })).toEqual([
      messages[0],
      expect.objectContaining({
        id: 'conv-1:turn-1:assistant:presentation',
        text: 'Presentation answer',
      }),
    ]);
  });

  test('buildThreadPresentationMessages uses ConversationView live entries over stale current-turn rows', () => {
    const messages = [
      { id: 'user-1', sender: 'user', text: 'Inspect workspace', turnRef: 'turn-view' },
    ];
    const conversationView = {
      conversationRef: 'conv-1',
      liveTurn: {
        turnRef: 'turn-view',
        entries: [{
          id: 'view-entry-1',
          type: 'llm-text',
          text: 'View-owned live answer',
          sourceEventType: 'assistant_delta',
          turnRef: 'turn-view',
        }],
      },
    };
    const sdkLiveTurn = {
      conversationRef: 'conv-1',
      turnRef: 'turn-stale',
      phase: 'streaming',
      assistantText: 'Stale raw answer',
      reasoningText: null,
      toolEvents: [],
      lastError: null,
      presentation: {
        entries: [{
          id: 'raw-entry-1',
          type: 'llm-text',
          text: 'Stale raw answer',
          turnRef: 'turn-stale',
        }],
      },
    };

    expect(buildThreadPresentationMessages(messages, {
      conversationView,
      sdkLiveTurn,
      activeConversationRef: 'conv-1',
    })).toEqual([
      messages[0],
      expect.objectContaining({
        id: 'view-entry-1',
        sender: 'assistant',
        text: 'View-owned live answer',
        sourceChannel: 'sdk:conversation-view',
        turnRef: 'turn-view',
      }),
    ]);
  });

  test('buildThreadPresentationMessages uses SDK live-entry fields for tool identity', () => {
    const messages = [
      { id: 'user-1', sender: 'user', text: 'Inspect workspace', turnRef: 'turn-1' },
    ];
    const sdkLiveTurn = {
      conversationRef: 'conv-1',
      turnRef: 'turn-1',
      phase: 'tool_call',
      assistantText: '',
      reasoningText: null,
      toolEvents: [],
      lastError: null,
      presentation: {
        entries: [{
          id: 'conv-1:turn-1:tool:tool-1',
          type: 'tool-call',
          text: '',
          sourceEventType: 'tool_call',
          sourceChannel: 'sdk:current-turn',
          turnRef: 'turn-1',
          toolName: 'read_file',
          requestId: 'req-read',
          correlationId: 'corr-read',
          modelFacingToolCall: {
            id: 'call-read',
            name: 'read_file',
            arguments: { path: 'README.md' },
          },
          toolArguments: { path: 'README.md' },
          toolCallDetails: {
            displaySource: 'sdk-entry-details',
          },
          payload: {
            toolName: 'read_file',
            requestId: 'req-read',
            correlationId: 'corr-read',
            args: { path: 'README.md' },
            structuredPayload: {
              tool_name: 'wrong_backend_tool',
              request_id: 'wrong-request',
              correlation_id: 'wrong-correlation',
              parameters: { path: 'wrong.md' },
            },
          },
        }],
      },
    };

    const rendered = buildThreadPresentationMessages(messages, {
      sdkLiveTurn,
      activeConversationRef: 'conv-1',
    });

    expect(rendered[1]).toEqual(expect.objectContaining({
      sender: 'assistant',
      type: 'tool-call',
      text: expect.stringContaining('"name": "read_file"'),
      correlationId: 'corr-read',
      modelFacingToolCall: expect.objectContaining({
        id: 'call-read',
        name: 'read_file',
        arguments: { path: 'README.md' },
      }),
      toolCallDetails: {
        displaySource: 'sdk-entry-details',
      },
    }));
    expect(rendered[1].text).not.toContain('wrong_backend_tool');
    expect(rendered[1].text).not.toContain('wrong.md');
    expect(rendered[1].correlationId).not.toBe('wrong-correlation');
  });

  test('buildThreadPresentationMessages ignores raw payload details for live tool rows', () => {
    const messages = [
      { id: 'user-1', sender: 'user', text: 'Inspect workspace', turnRef: 'turn-1' },
    ];
    const sdkLiveTurn = {
      conversationRef: 'conv-1',
      turnRef: 'turn-1',
      phase: 'tool_call',
      assistantText: '',
      reasoningText: null,
      toolEvents: [],
      lastError: null,
      presentation: {
        entries: [{
          id: 'conv-1:turn-1:tool:tool-1',
          type: 'tool-call',
          text: '',
          sourceEventType: 'tool_call',
          sourceChannel: 'sdk:current-turn',
          turnRef: 'turn-1',
          toolName: 'read_file',
          requestId: 'req-read',
          correlationId: 'corr-read',
          modelFacingToolCall: {
            id: 'call-read',
            name: 'read_file',
            arguments: { path: 'README.md' },
          },
          toolArguments: { path: 'README.md' },
          structuredPayload: {
            tool_name: 'wrong_backend_tool',
            parameters: { path: 'wrong.md' },
          },
          payload: {
            toolName: 'wrong_backend_tool',
            args: { path: 'wrong.md' },
            structuredPayload: {
              parameters: { path: 'also-wrong.md' },
            },
          },
        }],
      },
    };

    const rendered = buildThreadPresentationMessages(messages, {
      sdkLiveTurn,
      activeConversationRef: 'conv-1',
    });

    expect(rendered[1]).toEqual(expect.objectContaining({
      sender: 'assistant',
      type: 'tool-call',
      text: expect.stringContaining('"name": "read_file"'),
      correlationId: 'corr-read',
      modelFacingToolCall: expect.objectContaining({
        id: 'call-read',
        name: 'read_file',
        arguments: { path: 'README.md' },
      }),
    }));
    expect(rendered[1].text).not.toContain('wrong_backend_tool');
    expect(rendered[1].text).not.toContain('wrong.md');
    expect(rendered[1]).not.toHaveProperty('toolCallDetails');
  });

  test('buildThreadPresentationMessages ignores current-turn entries for another conversation', () => {
    const messages = [
      { id: 'user-1', sender: 'user', text: 'Inspect workspace', turnRef: 'turn-1' },
    ];
    const sdkLiveTurn = {
      conversationRef: 'conv-other',
      turnRef: 'turn-1',
      phase: 'streaming',
      assistantText: 'Wrong chat',
      reasoningText: null,
      toolEvents: [],
      lastError: null,
      presentation: {
        entries: [{
          id: 'conv-other:turn-1:assistant',
          type: 'llm-text',
          text: 'Wrong chat',
          turnRef: 'turn-1',
        }],
      },
    };

    expect(buildThreadPresentationMessages(messages, {
      sdkLiveTurn,
      activeConversationRef: 'conv-1',
    })).toBe(messages);
  });

  test('buildThreadPresentationMessages suppresses live assistant text once materialized', () => {
    const messages = [
      { id: 'user-1', sender: 'user', text: 'Inspect workspace', turnRef: 'turn-1' },
      {
        id: 'assistant-1',
        sender: 'assistant',
        text: 'Projected answer with more detail.',
        type: 'llm-text',
        turnRef: 'turn-1',
      },
    ];
    const sdkLiveTurn = {
      conversationRef: 'conv-1',
      turnRef: 'turn-1',
      phase: 'streaming',
      assistantText: 'Projected answer',
      reasoningText: null,
      toolEvents: [],
      lastError: null,
      presentation: {
        entries: [{
          id: 'conv-1:turn-1:assistant',
          type: 'llm-text',
          text: 'Projected answer',
          turnRef: 'turn-1',
        }],
      },
    };

    expect(buildThreadPresentationMessages(messages, {
      sdkLiveTurn,
      activeConversationRef: 'conv-1',
    })).toBe(messages);
  });

  test('buildThreadPresentationMessages drops current-turn thinking once assistant text is materialized', () => {
    const messages = [
      { id: 'user-1', sender: 'user', text: 'Inspect workspace', turnRef: 'turn-1' },
      {
        id: 'tool-call-1',
        sender: 'assistant',
        text: 'Reading README.md',
        type: 'tool-call',
        turnRef: 'turn-1',
      },
      {
        id: 'assistant-1',
        sender: 'assistant',
        text: 'The workspace contains src and tests.',
        type: 'llm-text',
        thinkingText: 'Checking the project structure.',
        turnRef: 'turn-1',
      },
    ];
    const sdkLiveTurn = {
      conversationRef: 'conv-1',
      turnRef: 'turn-1',
      phase: 'streaming',
      presentation: {
        entries: [{
          id: 'conv-1:turn-1:thinking',
          type: 'thinking',
          text: 'Checking the project structure.',
        }],
      },
    };

    expect(buildThreadPresentationMessages(messages, {
      sdkLiveTurn,
      activeConversationRef: 'conv-1',
    })).toBe(messages);
  });

  test('buildThreadPresentationMessages ignores stale current-turn thinking from an older user turn', () => {
    const messages = [
      { id: 'user-1', sender: 'user', text: 'Inspect workspace', turnRef: 'turn-1' },
      { id: 'user-2', sender: 'user', text: 'Now answer this', turnRef: 'turn-2' },
    ];
    const sdkLiveTurn = {
      conversationRef: 'conv-1',
      turnRef: 'turn-1',
      phase: 'streaming',
      presentation: {
        entries: [{
          id: 'conv-1:turn-1:thinking',
          type: 'thinking',
          text: 'Old turn thinking.',
        }],
      },
    };

    expect(buildThreadPresentationMessages(messages, {
      sdkLiveTurn,
      activeConversationRef: 'conv-1',
    })).toBe(messages);
  });

  test('keeps live search-source rows visible in thread presentation', () => {
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

    expect(buildThreadPresentationMessages(messages)).toEqual(messages);
  });

  test('keeps active tool-output rows visible in thread presentation', () => {
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

    expect(buildThreadPresentationMessages(messages)).toEqual(messages);
  });

  test('keeps completed raw tool-call rows in thread presentation', () => {
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

    expect(buildThreadPresentationMessages(messages)).toBe(messages);
  });

  test('keeps completed tool-output rows in thread presentation', () => {
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

    expect(buildThreadPresentationMessages(messages)).toBe(messages);
  });

});
