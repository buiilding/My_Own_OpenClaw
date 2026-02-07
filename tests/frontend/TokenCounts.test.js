import {
  buildTokenCountItems,
  formatTokenCount,
} from '../../frontend/src/renderer/features/chat/utils/tokenCounts';

describe('tokenCounts utils', () => {
  test('formats numeric token counts with locale separators', () => {
    expect(formatTokenCount(12345)).toBe('12,345');
  });

  test('defaults missing token counts to zero text', () => {
    expect(formatTokenCount(undefined)).toBe('0');
    expect(formatTokenCount(null)).toBe('0');
  });

  test('builds token count items in display order with labels and classes', () => {
    const items = buildTokenCountItems({
      input_tokens: 10,
      output_tokens: 20,
      total_tokens: 30,
      conversation_tokens: 40,
    });

    expect(items).toEqual([
      { key: 'input_tokens', label: 'Input', className: '', value: '10' },
      { key: 'output_tokens', label: 'Output', className: '', value: '20' },
      { key: 'total_tokens', label: 'Total', className: '', value: '30' },
      { key: 'conversation_tokens', label: 'Conversation', className: 'conversation-total', value: '40' },
    ]);
  });
});
