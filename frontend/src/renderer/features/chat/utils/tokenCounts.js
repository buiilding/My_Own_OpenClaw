const ACTIVE_CONVERSATION_TOTAL_FIELD = {
  key: 'conversation_tokens',
  label: 'Conversation Total',
  className: '',
};

export function formatTokenCount(value, fallback = '0') {
  return typeof value === 'number' ? value.toLocaleString() : fallback;
}

export function getActiveConversationTokenCount(tokenCounts) {
  const conversationTokens = tokenCounts?.conversation_tokens;
  if (typeof conversationTokens === 'number') {
    return formatTokenCount(conversationTokens);
  }

  return formatTokenCount(tokenCounts?.total_tokens);
}

export function buildTokenCountItems(tokenCounts) {
  return [{
    key: ACTIVE_CONVERSATION_TOTAL_FIELD.key,
    label: ACTIVE_CONVERSATION_TOTAL_FIELD.label,
    className: ACTIVE_CONVERSATION_TOTAL_FIELD.className,
    value: getActiveConversationTokenCount(tokenCounts),
  }];
}
