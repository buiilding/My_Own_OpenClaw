/**
 * Covers chat box response state. behavior in the frontend test suite.
 */

import {
  DesktopCurrentTurnMessageRuntime,
} from '../../src/renderer/app/runtime/desktopCurrentTurnMessageRuntime';

const {
  buildLegacyNoPresentationCurrentTurnMessages,
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

  test('buildLegacyNoPresentationCurrentTurnMessages creates overlay-ready active turn messages', () => {
    const messages = buildLegacyNoPresentationCurrentTurnMessages({
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

  test('buildLegacyNoPresentationCurrentTurnMessages preserves payload request ids for tool correlation', () => {
    const messages = buildLegacyNoPresentationCurrentTurnMessages({
      conversationRef: 'conv-1',
      turnRef: 'turn-1',
      phase: 'tool_call',
      assistantText: '',
      reasoningText: null,
      lastError: null,
      toolEvents: [{
        id: 'tool-1',
        kind: 'tool_call',
        payload: {
          toolName: 'read_file',
          requestId: 'request-tool-1',
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

  test('buildLegacyNoPresentationCurrentTurnMessages prefers explicit tool correlation ids', () => {
    const messages = buildLegacyNoPresentationCurrentTurnMessages({
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

  test('buildLegacyNoPresentationCurrentTurnMessages ignores presentation-backed current turns', () => {
    const messages = buildLegacyNoPresentationCurrentTurnMessages({
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

    expect(messages).toEqual([]);
  });

  test('buildLegacyNoPresentationCurrentTurnMessages renders SDK tool-output text', () => {
    const messages = buildLegacyNoPresentationCurrentTurnMessages({
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
