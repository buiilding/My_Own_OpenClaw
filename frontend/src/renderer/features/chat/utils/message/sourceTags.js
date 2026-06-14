/**
 * Provides the source tags module for the renderer UI.
 */

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
  'sdk-tool-result': 'sdk-tool-result',
  transcript: 'transcript',
  unknown: 'unknown-source',
};

const SOURCE_CHANNEL_LABELS = {
  'windie:conversation-event': 'windie:conversation-event',
  'renderer-local': 'renderer-local',
  'sdk-local-runtime': 'sdk-local-runtime',
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
