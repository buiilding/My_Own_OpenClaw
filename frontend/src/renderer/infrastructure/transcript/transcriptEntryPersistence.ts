/**
 * Provides the transcript entry persistence module for the renderer UI.
 */

import type { TranscriptProjectionAppendEntry } from './desktopConversationStore';
import { buildRehydrateMessagePayload } from './rehydrateMessageState';
import type { SessionInfo, TranscriptEntry } from './types';

type StoreTranscriptEntryDeps = {
  resolveSessionInfoForEntry: (entry: TranscriptEntry) => SessionInfo;
  appendTranscriptProjectionEntry: (userId: string, entry: TranscriptProjectionAppendEntry) => Promise<void>;
  emitStoredEvent: (entry: TranscriptEntry, info: SessionInfo) => void;
};

function buildReplayRehydrateEntry(entry: TranscriptEntry) {
  return buildRehydrateMessagePayload({
    role: entry.role || 'assistant',
    messageType: entry.messageType || null,
    rawContent: entry.content,
    timestamp: entry.timestamp || null,
    correlationId: entry.correlationId || null,
    transparency: entry.transparency || null,
    screenshotAttachment: entry.screenshotRef ? {
      screenshotRef: entry.screenshotRef,
      screenshot: null,
    } : null,
    structuredPayload: entry.structuredPayload || null,
    fallbackToolName: entry.toolName || null,
    fallbackToolCallId: entry.correlationId || null,
  });
}

export async function storeTranscriptEntry(
  entry: TranscriptEntry,
  deps: StoreTranscriptEntryDeps,
): Promise<void> {
  const info = deps.resolveSessionInfoForEntry(entry);
  if (!info.conversationRef || !info.userId) {
    return;
  }

  await deps.appendTranscriptProjectionEntry(info.userId, {
    messageId: entry.messageId,
    conversationRef: info.conversationRef,
    content: entry.content,
    role: entry.role,
    messageType: entry.messageType,
    toolName: entry.toolName,
    correlationId: entry.correlationId,
    modelId: entry.modelId,
    modelProvider: entry.modelProvider,
    screenshotRef: entry.screenshotRef || null,
    timestamp: entry.timestamp,
    transparency: entry.transparency,
    structuredPayload: entry.structuredPayload,
    rehydrateEntry: buildReplayRehydrateEntry(entry),
  });
  deps.emitStoredEvent(entry, info);
}
