/**
 * Covers desktop thread find runtime behavior in the frontend test suite.
 */

import { buildThreadFindState } from '../../frontend/src/renderer/app/runtime/desktopThreadFindRuntime';

describe('desktopThreadFindRuntime', () => {
  test('indexes matches across markdown, tool call, and tool output messages', () => {
    const state = buildThreadFindState([
      {
        id: 'assistant-1',
        sender: 'assistant',
        type: 'llm-text',
        text: 'First alpha answer',
      },
      {
        id: 'tool-call-1',
        sender: 'assistant',
        type: 'tool-call',
        modelFacingToolCall: {
          name: 'search_alpha',
          arguments: { query: 'alpha' },
        },
      },
      {
        id: 'tool-output-1',
        sender: 'tool',
        type: 'tool-output',
        modelFacingToolOutput: 'alpha result',
      },
      {
        id: 'summary-1',
        sender: 'assistant',
        type: 'tool-actions-summary',
        text: 'alpha hidden summary',
      },
    ], 'alpha');

    expect(state.totalMatches).toBe(4);
    expect(state.messageMatchIndexesById).toEqual({
      'assistant-1': [0],
      'tool-call-1': [1, 2],
      'tool-output-1': [3],
    });
  });

  test('returns empty state for blank queries or invalid messages', () => {
    expect(buildThreadFindState(null, 'alpha')).toEqual({
      totalMatches: 0,
      messageMatchIndexesById: {},
    });
    expect(buildThreadFindState([{ id: 'a', text: 'alpha' }], '  ')).toEqual({
      totalMatches: 0,
      messageMatchIndexesById: {},
    });
  });
});
