/**
 * Covers chat box response state. behavior in the frontend test suite.
 */

import {
  DesktopCurrentTurnMessageRuntime,
} from '../../frontend/src/renderer/app/runtime/desktopCurrentTurnMessageRuntime';

const {
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
    expect(isResponseOverlayProgressMessage({ type: 'search-source' })).toBe(true);
    expect(isResponseOverlayProgressMessage({ type: 'error' })).toBe(false);

    expect(isResponseOverlaySourceTaggedMessage({ type: 'llm-text' })).toBe(true);
    expect(isResponseOverlaySourceTaggedMessage({ type: 'error' })).toBe(true);
    expect(isResponseOverlaySourceTaggedMessage({ sourceEventType: 'tool-call' })).toBe(true);
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
        type: 'tool-call',
        text: expect.stringContaining('Reading README.md'),
      }),
    ]));
  });

  test('buildNoViewSdkLiveTurnMessages preserves projected request ids for tool correlation', () => {
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

    expect(messages).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'tool-call',
        text: 'Using read_file',
        correlationId: 'request-tool-1',
      }),
    ]));
  });

  test('buildNoViewSdkLiveTurnMessages prefers explicit tool correlation ids', () => {
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

    expect(messages).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'tool-call',
        correlationId: 'corr-tool-1',
      }),
    ]));
  });

  test('buildNoViewSdkLiveTurnMessages does not repair padded legacy tool event ids', () => {
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

    expect(messages).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'tool-call',
        correlationId: 'request-tool-1',
      }),
      expect.objectContaining({
        type: 'tool-output',
        correlationId: 'bundle-1',
      }),
    ]));
    expect(messages.map(message => message.correlationId)).not.toContain('corr-tool-1');
    expect(messages.map(message => message.correlationId)).not.toContain(' corr-tool-1 ');
    expect(messages.map(message => message.correlationId)).not.toContain('request-bundle-1');
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

  test('buildNoViewSdkLiveTurnMessages renders SDK tool-output text', () => {
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

    expect(messages).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'tool-output',
        text: expect.stringContaining('README contents'),
        modelFacingToolOutput: expect.stringContaining('README contents'),
      }),
    ]));
  });

});
