const TOKEN_COUNT_FIELDS = [
  { key: 'prompt_tokens', label: 'Prompt', className: '' },
  { key: 'visible_output_tokens', label: 'Output (Visible)', className: '' },
  { key: 'thinking_tokens', label: 'Thinking', className: '' },
  { key: 'output_tokens_total', label: 'Output (Total)', className: '' },
  { key: 'total_tokens', label: 'Total', className: '' },
  { key: 'conversation_tokens', label: 'Conversation', className: 'conversation-total' },
];

export function formatTokenCount(value, fallback = '0') {
  return typeof value === 'number' ? value.toLocaleString() : fallback;
}

export function buildTokenCountItems(tokenCounts) {
  return TOKEN_COUNT_FIELDS.map((field) => ({
    key: field.key,
    label: field.label,
    className: field.className,
    value: formatTokenCount(tokenCounts?.[field.key], field.key === 'thinking_tokens' ? 'N/A' : '0'),
  }));
}
