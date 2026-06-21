/**
 * Provides renderer message source tag labels for presentation surfaces.
 */

import {
  getSdkConversationEventSourceChannel,
  getSdkCurrentTurnSourceChannel,
  getSdkDisplayRowsSourceChannel,
} from './desktopPresentationSourceChannels';
import {
  resolveMessageTokenUsageTag,
} from './desktopMessageTokenUsageRuntime';

const sdkConversationEventSourceChannel = getSdkConversationEventSourceChannel();
const sdkCurrentTurnSourceChannel = getSdkCurrentTurnSourceChannel();
const sdkDisplayRowsSourceChannel = getSdkDisplayRowsSourceChannel();

const SOURCE_EVENT_LABELS = {
  'llm-thought': 'thinking token',
  'streaming-response': 'assistant stream',
  'streaming-complete': 'assistant completion',
  'context-compaction-started': 'compaction started',
  'context-compaction-completed': 'compaction completed',
  'context-compaction-failed': 'compaction failed',
  'tool-call': 'tool call',
  'tool-output': 'tool output',
  'tool-bundle': 'tool bundle',
  'local-user-message': 'user message',
  'system-prompt': 'system prompt',
  'user-message-full': 'user prompt',
  'assistant-message-full': 'assistant message',
  'token-count': 'token count',
  'tool-schemas': 'tool schemas',
  error: 'runtime error',
  'renderer-compose': 'renderer-compose',
  'sdk-tool-result': 'sdk-tool-result',
  transcript: 'transcript',
  unknown: 'unknown-source',
};

const SOURCE_CHANNEL_LABELS = {
  [sdkConversationEventSourceChannel]: 'sdk:conversation-event',
  [sdkCurrentTurnSourceChannel]: 'sdk:current-turn',
  [sdkDisplayRowsSourceChannel]: 'sdk:display-rows',
  'renderer-local': 'renderer-local',
  'sdk-local-runtime': 'sdk-local-runtime',
  transcript: 'transcript',
  unknown: 'unknown',
};

function resolveSourceTag(sourceEventType, sourceChannel) {
  const normalizedEventType = typeof sourceEventType === 'string' && sourceEventType.trim()
    ? sourceEventType.trim()
    : 'unknown';
  const normalizedChannel = typeof sourceChannel === 'string' && sourceChannel.trim()
    ? sourceChannel.trim()
    : 'unknown';
  const eventLabel = SOURCE_EVENT_LABELS[normalizedEventType] || `${normalizedEventType} event`;
  const channelLabel = SOURCE_CHANNEL_LABELS[normalizedChannel] || normalizedChannel;

  return `${eventLabel} / ${channelLabel}`;
}

function resolveMessageSourceBadgePresentation(message) {
  const sourceEventType = typeof message?.sourceEventType === 'string' && message.sourceEventType
    ? message.sourceEventType
    : 'transcript';
  const sourceChannel = typeof message?.sourceChannel === 'string' && message.sourceChannel
    ? message.sourceChannel
    : 'unknown';
  const tokenUsageTag = resolveMessageTokenUsageTag(message);
  const sourceTag = resolveSourceTag(sourceEventType, sourceChannel);
  return {
    badgeText: tokenUsageTag
      ? `${sourceTag} / ${tokenUsageTag}`
      : sourceTag,
    title: `source_event=${sourceEventType}`,
  };
}

function resolveThinkingSourceBadgePresentation(sourceEventType) {
  const resolvedSourceEventType = typeof sourceEventType === 'string' && sourceEventType.trim()
    ? sourceEventType.trim()
    : 'llm-thought';
  return {
    badgeText: resolveSourceTag(
      resolvedSourceEventType,
      sdkConversationEventSourceChannel,
    ),
    title: `source_event=${resolvedSourceEventType}`,
  };
}

export const DesktopMessageSourceTagRuntime = Object.freeze({
  resolveMessageSourceBadgePresentation,
  resolveSourceTag,
  resolveThinkingSourceBadgePresentation,
});
