import {
  buildTokenCountItems,
} from '../../frontend/src/renderer/features/chat/utils/tokenCounts';

describe('tokenCounts utils', () => {
  test('builds a single token count item for active conversation total', () => {
    const items = buildTokenCountItems({
      prompt_tokens: 10,
      visible_output_tokens: 12,
      thinking_tokens: null,
      output_tokens_total: 20,
      total_tokens: 30,
      conversation_tokens: 40,
    });

    expect(items).toEqual([
      { key: 'conversation_tokens', label: 'Conversation Total', className: '', value: '30' },
      { key: 'cache_status', label: 'Cache', className: '', value: 'Unknown' },
    ]);
  });

  test('shows cache hit details when cached tokens are present', () => {
    const items = buildTokenCountItems({
      conversation_tokens: 40,
      cached_tokens: 128,
      cache_status: 'hit',
      cache_hit: true,
    });

    expect(items[1]).toEqual(
      expect.objectContaining({
        key: 'cache_status',
        label: 'Cache',
        className: 'token-count-cache-hit',
        value: 'Hit (128 cached)',
      }),
    );
  });

  test('shows cache miss when provider reports miss', () => {
    const items = buildTokenCountItems({
      conversation_tokens: 40,
      cache_status: 'miss',
      cache_hit: false,
    });

    expect(items[1]).toEqual(
      expect.objectContaining({
        key: 'cache_status',
        value: 'Miss',
      }),
    );
  });

  test('formats total token values and falls back to conversation tokens', () => {
    const withConversation = buildTokenCountItems({
      total_tokens: 300,
      conversation_tokens: 120,
    });
    expect(withConversation[0].value).toBe('300');

    const withoutConversation = buildTokenCountItems({
      total_tokens: 300,
      conversation_tokens: undefined,
    });
    expect(withoutConversation[0].value).toBe('300');

    const withoutTotal = buildTokenCountItems({
      total_tokens: undefined,
      conversation_tokens: 120,
    });
    expect(withoutTotal[0].value).toBe('120');
  });

  test('defaults missing token counts to zero text', () => {
    const missing = buildTokenCountItems({});
    expect(missing[0].value).toBe('0');
  });

  test('formats zero, decimal, and large values', () => {
    const zero = buildTokenCountItems({ conversation_tokens: 0 });
    expect(zero[0].value).toBe('0');

    const decimal = buildTokenCountItems({ conversation_tokens: 1234.5 });
    expect(decimal[0].value).toBe('1,234.5');

    const large = buildTokenCountItems({ conversation_tokens: 12345 });
    expect(large[0].value).toBe('12,345');
  });
});
