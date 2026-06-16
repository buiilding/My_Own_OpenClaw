/**
 * Covers tool output content. behavior in the frontend test suite.
 */

import {
  normalizeLocalToolResultData,
  readToolOutputContent,
} from '../../packages/windie-sdk-js/src/tools/toolOutputContent';

describe('local tool output content contract', () => {
  test('does not infer model-facing output from structured browser fields', () => {
    const normalized = normalizeLocalToolResultData({
      snapshot: 'browser state text',
      extracted_content: 'extracted page text',
      content: 'ignored structured content',
    });

    expect(normalized).toEqual({
      snapshot: 'browser state text',
      extracted_content: 'extracted page text',
      content: 'ignored structured content',
      output: '',
    });
  });

  test('preserves explicit output even when fallback output is present', () => {
    expect(normalizeLocalToolResultData({ output: '' }, 'tool failed')).toEqual({
      output: '',
    });
    expect(normalizeLocalToolResultData({ message: 'readable message' })).toEqual({
      message: 'readable message',
      output: 'readable message',
    });
  });

  test('does not treat assistant content fields as tool output text', () => {
    expect(readToolOutputContent({
      content: 'assistant-shaped content',
      final_response: 'assistant final response',
    })).toEqual({
      displayContent: '{"content":"assistant-shaped content","final_response":"assistant final response"}',
      modelContent: '{"content":"assistant-shaped content","final_response":"assistant final response"}',
      hasModelContent: false,
    });
  });

  test('strips diagnostic path trace metadata from model-facing tool data', () => {
    expect(normalizeLocalToolResultData({
      output: 'Screenshot captured successfully.',
      path_trace: {
        captureEngine: 'pyautogui_fallback',
        byteCount: 123,
      },
    })).toEqual({
      output: 'Screenshot captured successfully.',
    });
  });
});
