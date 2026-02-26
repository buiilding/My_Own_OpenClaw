const SOURCE_EVENT_LABELS = {
  'llm-thought': 'thinking-token API',
  'streaming-response': 'normal-text API',
  'streaming-complete': 'streaming-complete API',
  'context-compaction-started': 'context-compaction-started API',
  'context-compaction-completed': 'context-compaction-completed API',
  'context-compaction-failed': 'context-compaction-failed API',
  'tool-call': 'tool-call API',
  'tool-output': 'tool-output API',
  'tool-bundle': 'tool-bundle API',
  'local-user-message': 'local-user-message API',
  'system-prompt': 'system-prompt API',
  'user-message-full': 'user-message-full API',
  'assistant-message-full': 'assistant-message-full API',
  'token-count': 'token-count API',
  'tool-schemas': 'tool-schemas API',
  error: 'error API',
  'renderer-compose': 'renderer-compose',
  'tool-runner-result': 'tool-runner-result',
  transcript: 'transcript',
  unknown: 'unknown-source',
};

const SOURCE_CHANNEL_LABELS = {
  'from-backend': 'from-backend',
  'renderer-local': 'renderer-local',
  'renderer-tool-runner': 'renderer-tool-runner',
  transcript: 'transcript',
  unknown: 'unknown',
};

export function resolveSourceTag(sourceEventType, sourceChannel) {
  const normalizedEventType = typeof sourceEventType === 'string' && sourceEventType.trim()
    ? sourceEventType.trim()
    : 'unknown';
  const normalizedChannel = typeof sourceChannel === 'string' && sourceChannel.trim()
    ? sourceChannel.trim()
    : 'unknown';
  const eventLabel = SOURCE_EVENT_LABELS[normalizedEventType] || `${normalizedEventType} API`;
  const channelLabel = SOURCE_CHANNEL_LABELS[normalizedChannel] || normalizedChannel;

  return `${eventLabel} · ${channelLabel}`;
}
