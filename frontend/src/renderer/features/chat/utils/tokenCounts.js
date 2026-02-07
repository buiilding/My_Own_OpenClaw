const TOKEN_COUNT_FIELDS = [
  { key: 'input_tokens', label: 'Input', className: '' },
  { key: 'output_tokens', label: 'Output', className: '' },
  { key: 'total_tokens', label: 'Total', className: '' },
  { key: 'conversation_tokens', label: 'Conversation', className: 'conversation-total' },
];

export function formatTokenCount(value) {
  return typeof value === 'number' ? value.toLocaleString() : '0';
}

export function buildTokenCountItems(tokenCounts) {
  return TOKEN_COUNT_FIELDS.map((field) => ({
    key: field.key,
    label: field.label,
    className: field.className,
    value: formatTokenCount(tokenCounts?.[field.key]),
  }));
}
