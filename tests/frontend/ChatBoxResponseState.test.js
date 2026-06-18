/**
 * Covers chat box response state. behavior in the frontend test suite.
 */

import {
  buildCurrentTurnMessagesFromProjection,
  isResponseCloseable,
  normalizeThinkingText,
} from '../../frontend/src/renderer/features/chat/utils/state/chatBoxResponseState';

describe('chatBoxResponseState', () => {
  test('isResponseCloseable allows complete and error responses', () => {
    expect(isResponseCloseable(null)).toBe(false);
    expect(isResponseCloseable({ type: 'llm-text', isComplete: false })).toBe(false);
    expect(isResponseCloseable({ type: 'llm-text', isComplete: true })).toBe(true);
    expect(isResponseCloseable({ type: 'error', isComplete: false })).toBe(true);
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
