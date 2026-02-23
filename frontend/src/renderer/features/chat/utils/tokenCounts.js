const ACTIVE_CONVERSATION_TOTAL_FIELD = {
  key: 'conversation_tokens',
  label: 'Conversation Total',
  className: '',
};

const CACHE_STATUS_FIELD = {
  key: 'cache_status',
  label: 'Cache',
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
  const cacheStatus = tokenCounts?.cache_status;
  const cacheHit = tokenCounts?.cache_hit;
  const cachedTokens = tokenCounts?.cached_tokens;

  let resolvedStatus = cacheStatus;
  if (!resolvedStatus) {
    if (cacheHit === true) {
      resolvedStatus = 'hit';
    } else if (cacheHit === false) {
      resolvedStatus = 'miss';
    } else {
      resolvedStatus = 'unknown';
    }
  }

  const cacheValue = resolvedStatus === 'hit'
    ? `Hit (${formatTokenCount(cachedTokens, '0')} cached)`
    : resolvedStatus === 'miss'
      ? 'Miss'
      : 'Unknown';

  return [
    {
      key: ACTIVE_CONVERSATION_TOTAL_FIELD.key,
      label: ACTIVE_CONVERSATION_TOTAL_FIELD.label,
      className: ACTIVE_CONVERSATION_TOTAL_FIELD.className,
      value: getActiveConversationTokenCount(tokenCounts),
    },
    {
      key: CACHE_STATUS_FIELD.key,
      label: CACHE_STATUS_FIELD.label,
      className: resolvedStatus === 'hit' ? 'token-count-cache-hit' : '',
      value: cacheValue,
    },
  ];
}
