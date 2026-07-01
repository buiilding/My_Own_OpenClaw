/**
 * Covers chat box response state. behavior in the frontend test suite.
 */

import {
  DesktopCurrentTurnMessageRuntime,
} from '../../src/renderer/app/runtime/desktopCurrentTurnMessageRuntime';

const {
  buildConversationViewLiveTurnMessages,
  buildNoViewSdkLiveTurnMessages,
  isResponseCloseable,
  isResponseOverlayProgressMessage,
  isResponseOverlaySourceTaggedMessage,
  isVisibleResponseOverlayMessage,
} = DesktopCurrentTurnMessageRuntime;

describe('desktopCurrentTurnMessageRuntime', () => {
  test('isResponseCloseable allows complete and error responses', () => {
    expect(isResponseCloseable(null)).toBe(false);
    expect(isResponseCloseable({ type: 'llm-text', isComplete: false })).toBe(false);
    expect(isResponseCloseable({ type: 'llm-text', isComplete: true })).toBe(true);
    expect(isResponseCloseable({ type: 'error', isComplete: false })).toBe(true);
  });

  test('classifies response overlay display entries', () => {
    expect(isVisibleResponseOverlayMessage({
      sender: 'assistant',
      type: 'llm-text',
      text: ' visible ',
    })).toBe(true);
    expect(isVisibleResponseOverlayMessage({
      sender: 'assistant',
      type: 'llm-text',
      thinkingText: ' thinking ',
    })).toBe(true);
    expect(isVisibleResponseOverlayMessage({
      sender: 'assistant',
      type: 'tool-call',
      text: '',
    })).toBe(true);
    expect(isVisibleResponseOverlayMessage({
      sender: 'user',
      type: 'tool-call',
      text: '',
    })).toBe(false);
    expect(isVisibleResponseOverlayMessage({
      sender: 'assistant',
      type: 'llm-text',
      text: '   ',
    })).toBe(false);

    expect(isResponseOverlayProgressMessage({ type: 'tool-explanation' })).toBe(true);
    expect(isResponseOverlayProgressMessage({ type: 'tool-progress' })).toBe(true);
    expect(isResponseOverlayProgressMessage({ type: 'search-source' })).toBe(true);
    expect(isResponseOverlayProgressMessage({ type: 'error' })).toBe(false);

    expect(isResponseOverlaySourceTaggedMessage({ type: 'llm-text' })).toBe(true);
    expect(isResponseOverlaySourceTaggedMessage({ type: 'error' })).toBe(true);
    expect(isResponseOverlaySourceTaggedMessage({ sourceEventType: 'tool-call' })).toBe(true);
    expect(isResponseOverlaySourceTaggedMessage({ sourceEventType: ' tool-call ' })).toBe(false);
    expect(isResponseOverlaySourceTaggedMessage({ sourceEventType: '   ' })).toBe(false);
  });

  test('buildNoViewSdkLiveTurnMessages creates overlay-ready legacy active turn messages', () => {
    const messages = buildNoViewSdkLiveTurnMessages({
      conversationRef: 'conv-1',
      turnRef: 'turn-1',
      phase: 'tool_call',
      assistantText: '',
      reasoningText: 'Inspecting files',
      lastError: null,
      toolEvents: [{
        id: 'tool-1',
        kind: 'tool_call',
        toolName: 'read_file',
        text: 'Reading README.md',
        status: null,
        modelFacingToolCall: {
          name: 'read_file',
          arguments: { explanation: 'Reading README.md' },
        },
        toolArguments: { explanation: 'Reading README.md' },
        toolCallDetails: {
          toolName: 'read_file',
        },
        payload: {
          toolName: 'read_file',
        },
      }],
    });

    expect(messages).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'conv-1:turn-1:thinking',
        type: 'llm-text',
        thinkingText: 'Inspecting files',
      }),
    ]));
    expect(messages.map(message => message.type)).not.toContain('tool-call');
    expect(JSON.stringify(messages)).not.toContain('Reading README.md');
  });

  test('buildNoViewSdkLiveTurnMessages ignores raw tool-event request ids', () => {
    const messages = buildNoViewSdkLiveTurnMessages({
      conversationRef: 'conv-1',
      turnRef: 'turn-1',
      phase: 'tool_call',
      assistantText: '',
      reasoningText: null,
      lastError: null,
      toolEvents: [{
        id: 'tool-1',
        kind: 'tool_call',
        toolName: 'read_file',
        requestId: 'request-tool-1',
        payload: {
          toolName: 'wrong_backend_tool',
          requestId: 'wrong-request',
        },
      }],
    });

    expect(messages).toEqual([
      expect.objectContaining({
        id: 'conv-1:turn-1:user-marker',
      }),
    ]);
    expect(JSON.stringify(messages)).not.toContain('request-tool-1');
    expect(JSON.stringify(messages)).not.toContain('wrong_backend_tool');
  });

  test('buildNoViewSdkLiveTurnMessages ignores explicit raw tool correlation ids', () => {
    const messages = buildNoViewSdkLiveTurnMessages({
      conversationRef: 'conv-1',
      turnRef: 'turn-1',
      phase: 'tool_call',
      assistantText: '',
      reasoningText: null,
      lastError: null,
      toolEvents: [{
        id: 'tool-1',
        kind: 'tool_call',
        toolName: 'read_file',
        correlationId: 'corr-tool-1',
        payload: {
          requestId: 'request-tool-1',
        },
      }],
    });

    expect(messages).toEqual([
      expect.objectContaining({
        id: 'conv-1:turn-1:user-marker',
      }),
    ]);
    expect(JSON.stringify(messages)).not.toContain('corr-tool-1');
  });

  test('buildNoViewSdkLiveTurnMessages ignores legacy tool event ids', () => {
    const messages = buildNoViewSdkLiveTurnMessages({
      conversationRef: 'conv-1',
      turnRef: 'turn-1',
      phase: 'tool_call',
      assistantText: '',
      reasoningText: null,
      lastError: null,
      toolEvents: [
        {
          id: 'tool-call-1',
          kind: 'tool_call',
          toolName: 'read_file',
          correlationId: ' corr-tool-1 ',
          requestId: 'request-tool-1',
        },
        {
          id: 'bundle-output-1',
          kind: 'tool_output',
          toolName: 'tool_bundle',
          text: 'bundle result',
          correlationId: ' corr-bundle-1 ',
          requestId: ' request-bundle-1 ',
          bundleId: 'bundle-1',
        },
      ],
    });

    expect(messages).toEqual([
      expect.objectContaining({
        id: 'conv-1:turn-1:user-marker',
      }),
    ]);
    expect(JSON.stringify(messages)).not.toContain('tool-call-1');
    expect(JSON.stringify(messages)).not.toContain('bundle-output-1');
    expect(JSON.stringify(messages)).not.toContain('request-tool-1');
    expect(JSON.stringify(messages)).not.toContain('bundle-1');
  });

  test('buildNoViewSdkLiveTurnMessages ignores legacy tool event names', () => {
    const messages = buildNoViewSdkLiveTurnMessages({
      conversationRef: 'conv-1',
      turnRef: 'turn-1',
      phase: 'tool_call',
      assistantText: '',
      reasoningText: null,
      lastError: null,
      toolEvents: [
        {
          id: 'tool-call-1',
          kind: 'tool_call',
          toolName: ' read_file ',
          requestId: 'request-tool-1',
        },
        {
          id: 'tool-output-1',
          kind: 'tool_output',
          toolName: ' screenshot ',
          requestId: 'request-tool-2',
        },
        {
          id: 'tool-progress-1',
          kind: 'tool_progress',
          toolName: ' web_search ',
        },
      ],
    });

    expect(messages).toEqual([
      expect.objectContaining({
        id: 'conv-1:turn-1:user-marker',
      }),
    ]);
    expect(JSON.stringify(messages)).not.toContain('read_file');
    expect(JSON.stringify(messages)).not.toContain('screenshot');
    expect(JSON.stringify(messages)).not.toContain('web_search');
  });

  test('buildNoViewSdkLiveTurnMessages rejects missing or padded conversation refs', () => {
    const messages = buildNoViewSdkLiveTurnMessages({
      conversationRef: ' conv-1 ',
      turnRef: 'turn-1',
      phase: 'streaming',
      assistantText: 'Projected response',
      reasoningText: 'Projected thinking',
      lastError: null,
      toolEvents: [{
        id: 'tool-call-1',
        kind: 'tool_call',
        toolName: 'read_file',
        requestId: 'request-tool-1',
      }],
    });
    const missingConversationMessages = buildNoViewSdkLiveTurnMessages({
      turnRef: ' turn-1 ',
      phase: 'streaming',
      assistantText: 'Projected response',
      reasoningText: 'Projected thinking',
      lastError: null,
      toolEvents: [{
        id: 'tool-call-1',
        kind: 'tool_call',
        toolName: 'read_file',
        requestId: 'request-tool-1',
      }],
    });

    expect(messages).toEqual([]);
    expect(missingConversationMessages).toEqual([]);
  });

  test('buildNoViewSdkLiveTurnMessages does not expose padded live-turn refs', () => {
    const messages = buildNoViewSdkLiveTurnMessages({
      conversationRef: 'conv-1',
      turnRef: ' turn-1 ',
      phase: 'streaming',
      assistantText: 'Projected response',
      reasoningText: 'Projected thinking',
      lastError: null,
      toolEvents: [{
        id: 'tool-call-1',
        kind: 'tool_call',
        toolName: 'read_file',
        requestId: 'request-tool-1',
      }],
    });

    expect(messages).toEqual([]);
    expect(messages.some(message => message.id.includes(' conv-1 '))).toBe(false);
    expect(messages.some(message => message.id.includes(' turn-1 '))).toBe(false);
    expect(messages.map(message => message.turnRef)).not.toContain(' turn-1 ');
    expect(messages.map(message => message.turnRef)).not.toContain('turn-1');
  });

  test('buildConversationViewLiveTurnMessages does not expose padded live-turn refs', () => {
    const messages = buildConversationViewLiveTurnMessages({
      conversationRef: ' conv-1 ',
      liveTurn: {
        turnRef: ' turn-1 ',
        entries: [{
          id: 'conv-1:turn-1:assistant',
          type: 'llm-text',
          text: 'Projected response',
          sourceEventType: 'assistant_delta',
        }],
      },
    });

    expect(messages).toEqual([
      expect.objectContaining({
        id: 'conv-1:turn-1:assistant',
        text: 'Projected response',
      }),
    ]);
    expect(messages[0]).not.toHaveProperty('turnRef');
    expect(messages.map(message => message.turnRef)).not.toContain(' turn-1 ');
    expect(messages.map(message => message.turnRef)).not.toContain('turn-1');
  });

  test('buildNoViewSdkLiveTurnMessages uses presentation-backed current turns before legacy fallback', () => {
    const messages = buildNoViewSdkLiveTurnMessages({
      conversationRef: 'conv-1',
      turnRef: 'turn-1',
      phase: 'streaming',
      assistantText: 'stale raw fallback',
      reasoningText: 'stale raw reasoning',
      toolEvents: [{
        id: 'tool-1',
        kind: 'tool_call',
        toolName: 'read_file',
      }],
      presentation: {
        entries: [{
          id: 'entry-1',
          type: 'llm-text',
          text: 'SDK presentation owns this',
        }],
      },
    });

    expect(messages).toEqual([
      expect.objectContaining({
        id: 'entry-1',
        type: 'llm-text',
        text: 'SDK presentation owns this',
      }),
    ]);
  });

  test('buildNoViewSdkLiveTurnMessages ignores raw tool-output event text', () => {
    const messages = buildNoViewSdkLiveTurnMessages({
      conversationRef: 'conv-1',
      turnRef: 'turn-1',
      phase: 'tool_output',
      assistantText: '',
      reasoningText: null,
      lastError: null,
      toolEvents: [{
        id: 'bundle-output-1',
        kind: 'tool_output',
        toolName: 'tool_bundle',
        status: 'success',
        text: 'read_file #1\nREADME contents',
        toolOutputDetails: {
          bundleId: 'bundle-read',
          stepResults: [{
            tool: 'read_file',
            status: 'ok',
            output: {
              output: 'README contents',
            },
          }],
        },
        payload: {
          bundleId: 'bundle-read',
        },
      }],
    });

    expect(messages).toEqual([
      expect.objectContaining({
        id: 'conv-1:turn-1:user-marker',
      }),
    ]);
    expect(messages.map(message => message.type)).not.toContain('tool-output');
    expect(JSON.stringify(messages)).not.toContain('README contents');
  });

});
