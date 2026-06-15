/**
 * Covers chat box response state. behavior in the frontend test suite.
 */

import {
  buildCurrentTurnMessagesFromProjection,
  buildCurrentTurnResponseOverlayEntries,
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

  test('buildCurrentTurnResponseOverlayEntries ignores non-tool explanatory rows without tool-call content', () => {
    expect(buildCurrentTurnResponseOverlayEntries([
      { id: 'user-1', sender: 'user', text: 'find the answer' },
      { id: 'assistant-1', sender: 'assistant', type: 'tool-explanation', text: 'Searching https://example.com' },
    ])).toEqual([]);
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
        payload: {
          toolName: 'read_file',
          args: { explanation: 'Reading README.md' },
        },
      }],
    });

    expect(buildCurrentTurnResponseOverlayEntries(messages)).toEqual([
      expect.objectContaining({
        type: 'tool-explanation',
        text: 'Reading README.md',
      }),
    ]);
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
        payload: {
          bundleId: 'bundle-read',
          stepResults: [{
            tool: 'read_file',
            status: 'ok',
            output: {
              output: 'README contents',
            },
          }],
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
