import { normalizeLocalToolResultData } from '../../packages/windie-sdk-js/src/tools/toolOutputContent';

describe('local tool output content contract', () => {
  test('does not infer model-facing output from legacy local result fields', () => {
    const normalized = normalizeLocalToolResultData({
      snapshot: 'browser state text',
      extracted_content: 'extracted page text',
      llm_content: 'legacy model text',
      return_display: 'legacy display text',
      display_content: 'legacy display content',
      model_llm_content: 'legacy model content',
      content: 'legacy content fallback',
    });

    expect(normalized).toEqual({
      snapshot: 'browser state text',
      extracted_content: 'extracted page text',
      content: 'legacy content fallback',
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
});
