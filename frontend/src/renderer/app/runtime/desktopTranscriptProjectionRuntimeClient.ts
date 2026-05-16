import {
  ElectronSidecarConversationStore,
  type TranscriptProjectionRewriteEntry,
} from '../../infrastructure/transcript/ElectronSidecarConversationStore';
import {
  storeTranscriptEntry,
} from '../../infrastructure/transcript/transcriptEntryPersistence';
import type {
  SessionInfo,
  TranscriptEntry,
  TranscriptStructuredToolPayload,
  TranscriptTransparencyData,
} from '../../infrastructure/transcript/types';
import type {
  CompactedReplaySnapshot,
  RehydrateSnapshot,
} from '../../infrastructure/api/windieSdkClient';

type RewriteTranscriptProjectionInput = {
  conversationRef: string;
  userId: string;
  transcriptEntries: TranscriptProjectionRewriteEntry[];
  rehydrateEntries: TranscriptProjectionRewriteEntry[];
};

type LoadRehydrateSnapshotInput = {
  conversationRef: string;
  userId: string;
};

type TranscriptProjectionRecordOptions = {
  conversationRef?: string | null;
  sessionId?: string | null;
  userId?: string | null;
  timestamp?: string;
  messageType?: string;
  toolName?: string;
  correlationId?: string;
  modelId?: string | null;
  modelProvider?: string | null;
  screenshotRef?: string | null;
  transparency?: TranscriptTransparencyData | null;
  structuredPayload?: TranscriptStructuredToolPayload | null;
};

function resolveSessionInfoForEntry(entry: TranscriptEntry): SessionInfo {
  return {
    conversationRef: entry.conversationRef ?? null,
    userId: entry.userId ?? null,
  };
}

function emitTranscriptEntryStoredEvent(
  entry: TranscriptEntry,
  info: SessionInfo,
): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(new CustomEvent('transcript-entry-stored', {
    detail: {
      conversationRef: info.conversationRef,
      userId: info.userId,
      role: entry.role,
      messageType: entry.messageType,
      toolName: entry.toolName ?? null,
      correlationId: entry.correlationId ?? null,
      timestamp: entry.timestamp ?? null,
    },
  }));
}

async function persistProjectionEntry(entry: TranscriptEntry): Promise<void> {
  await storeTranscriptEntry(entry, {
    resolveSessionInfoForEntry,
    createConversationStore: (userId) => new ElectronSidecarConversationStore({ userId }),
    emitStoredEvent: emitTranscriptEntryStoredEvent,
  });
}

function recordProjectionEntry(entry: TranscriptEntry): void {
  void persistProjectionEntry(entry).catch((error) => {
    console.warn('[DesktopTranscriptProjectionRuntimeClient] Failed to store transcript projection entry:', error);
  });
}

export const DesktopTranscriptProjectionRuntimeClient = {
  recordUserMessage(
    text: string,
    options: TranscriptProjectionRecordOptions = {},
  ): void {
    recordProjectionEntry({
      content: text,
      role: 'user',
      messageType: 'user',
      timestamp: options.timestamp,
      modelId: options.modelId,
      modelProvider: options.modelProvider,
      screenshotRef: options.screenshotRef,
      transparency: options.transparency,
      conversationRef: options.conversationRef ?? options.sessionId ?? null,
      userId: options.userId ?? null,
    });
  },

  recordAssistantMessage(
    text: string,
    options: TranscriptProjectionRecordOptions = {},
  ): void {
    recordProjectionEntry({
      content: text,
      role: 'assistant',
      messageType: options.messageType || 'llm-text',
      timestamp: options.timestamp,
      modelId: options.modelId,
      modelProvider: options.modelProvider,
      screenshotRef: options.screenshotRef,
      transparency: options.transparency,
      structuredPayload: options.structuredPayload,
      conversationRef: options.conversationRef ?? options.sessionId ?? null,
      userId: options.userId ?? null,
    });
  },

  recordToolMessage(
    text: string,
    options: TranscriptProjectionRecordOptions & {
      messageType: string;
    },
  ): void {
    recordProjectionEntry({
      content: text,
      role: options.messageType === 'tool-call' ? 'assistant' : 'tool',
      messageType: options.messageType,
      toolName: options.toolName,
      correlationId: options.correlationId,
      timestamp: options.timestamp,
      modelId: options.modelId,
      modelProvider: options.modelProvider,
      screenshotRef: options.screenshotRef,
      transparency: options.transparency,
      structuredPayload: options.structuredPayload,
      conversationRef: options.conversationRef ?? options.sessionId ?? null,
      userId: options.userId ?? null,
    });
  },

  async replaceCompactedReplay(
    snapshot: CompactedReplaySnapshot,
    userId: string,
  ): Promise<void> {
    const store = new ElectronSidecarConversationStore({ userId });
    await store.replaceCompactedReplay(snapshot);
  },

  async rewriteTranscriptProjection({
    conversationRef,
    userId,
    transcriptEntries,
    rehydrateEntries,
  }: RewriteTranscriptProjectionInput): Promise<RehydrateSnapshot> {
    const store = new ElectronSidecarConversationStore({ userId });
    return store.rewriteTranscriptProjection({
      conversationRef,
      entries: transcriptEntries,
      rehydrateEntries,
    });
  },

  async loadRehydrateSnapshot({
    conversationRef,
    userId,
  }: LoadRehydrateSnapshotInput): Promise<RehydrateSnapshot> {
    const store = new ElectronSidecarConversationStore({ userId });
    return store.loadForRehydrate(conversationRef);
  },
};

export type {
  LoadRehydrateSnapshotInput,
  RewriteTranscriptProjectionInput,
  TranscriptProjectionRewriteEntry,
};
