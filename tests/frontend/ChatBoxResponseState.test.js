/**
 * Covers chat box response state. behavior in the frontend test suite.
 */

import {
  buildCurrentTurnMessagesFromProjection,
  isResponseCloseable,
  isResponseOverlayProgressMessage,
  isResponseOverlaySourceTaggedMessage,
  isVisibleResponseOverlayMessage,
  normalizeThinkingText,
} from '../../frontend/src/renderer/app/runtime/desktopCurrentTurnMessageRuntime';

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

  test('normalizeThinkingText trims string input and normalizes non-string to empty', () => {
    expect(normalizeThinkingText('  Thinking...  ')).toBe('Thinking...');
    expect(normalizeThinkingText('')).toBe('');
    expect(normalizeThinkingText(null)).toBe('');
  });

  test('buildCurrentTurnMessagesFromProjection creates overlay-ready active turn messages', () => {
    const messages = buildCurrentTurnMessagesFromProjection({
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

  test('buildCurrentTurnMessagesFromProjection renders tool-bundle-output step content', () => {
    const messages = buildCurrentTurnMessagesFromProjection({
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
