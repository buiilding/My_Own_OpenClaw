import {
  buildTokenCountItems,
  formatTokenCount,
  getActiveConversationTokenCount,
} from '../../frontend/src/renderer/features/chat/utils/tokenCounts';

describe('tokenCounts utils', () => {
  test('formats numeric token counts with locale separators', () => {
    expect(formatTokenCount(12345)).toBe('12,345');
  });

  test('defaults missing token counts to zero text', () => {
    expect(formatTokenCount(undefined)).toBe('0');
    expect(formatTokenCount(null)).toBe('0');
  });

  test('supports custom fallback text for missing values', () => {
    expect(formatTokenCount(undefined, 'N/A')).toBe('N/A');
  });

  test('formats zero and decimal values', () => {
    expect(formatTokenCount(0)).toBe('0');
    expect(formatTokenCount(1234.5)).toBe('1,234.5');
  });

  test('returns active conversation tokens when available', () => {
    expect(getActiveConversationTokenCount({
      total_tokens: 300,
      conversation_tokens: 120,
    })).toBe('120');
  });

  test('falls back to total tokens when conversation tokens are missing', () => {
    expect(getActiveConversationTokenCount({
      total_tokens: 300,
      conversation_tokens: undefined,
    })).toBe('300');
  });

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
      { key: 'conversation_tokens', label: 'Conversation Total', className: '', value: '40' },
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
});
