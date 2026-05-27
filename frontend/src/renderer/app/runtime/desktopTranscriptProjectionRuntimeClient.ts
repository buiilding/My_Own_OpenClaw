import {
  appendTranscriptProjectionEntry,
  createDesktopConversationStore,
  rewriteTranscriptProjection as rewriteDesktopTranscriptProjection,
  type TranscriptProjectionRewriteEntry,
} from '../../infrastructure/transcript/desktopConversationStore';
import { createPendingTranscriptMessages } from '../../infrastructure/transcript/pending/pendingTranscriptMessages';
import { normalizeTransparencyData } from '../../infrastructure/transcript/transparencyNormalization';
import {
  storeTranscriptEntry,
} from '../../infrastructure/transcript/transcriptEntryPersistence';
import { recordImmediateTranscriptEntry } from '../../infrastructure/transcript/transcriptRecordWrite';
import type {
  SessionInfo,
  TranscriptEntry,
  TranscriptStructuredToolPayload,
  TranscriptTransparencyData,
} from '../../infrastructure/transcript/types';
import type {
  CompactedReplaySnapshot,
  DisplayConversation,
  ConversationMetadata,
  ConversationStore,
  ListConversationOptions,
  RehydrateSnapshot,
} from '../../infrastructure/api/windieSdkClient';
import {
  desktopTranscriptSessionRuntime,
  subscribeDesktopTranscriptSessionRuntimeUpdates,
  type TranscriptSessionResolveOptions,
} from './desktopTranscriptSessionRuntime';

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

type SeededConversationStoreInput = {
  conversationRef: string;
  userId: string;
  projectionEntries: TranscriptProjectionRewriteEntry[];
};

type TranscriptProjectionRecordOptions = {
  messageId?: string | null;
  conversationRef?: string | null;
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
  return desktopTranscriptSessionRuntime.resolveSessionInfoFromOptions({
    conversationRef: entry.conversationRef ?? null,
    userId: entry.userId ?? null,
  });
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
    appendTranscriptProjectionEntry,
    emitStoredEvent: emitTranscriptEntryStoredEvent,
  });
}

function storeImmediateProjectionEntryWithRetry(
  entry: TranscriptEntry,
  queueForRetry: () => void,
  warningMessage: string,
): void {
  void persistProjectionEntry(entry).catch((error) => {
    queueForRetry();
    console.warn(warningMessage, error);
  });
}

function resolveSessionInfoOrQueue(
  options: TranscriptSessionResolveOptions,
  queueForRetry: () => void,
): SessionInfo | null {
  return desktopTranscriptSessionRuntime.resolveSessionInfoOrQueue(options, queueForRetry);
}

async function flushPendingProjectionMessages(): Promise<void> {
  if (!pendingProjectionMessages.hasPendingEntries()) {
    return;
  }
  await pendingProjectionMessages.flushPendingMessages(
    desktopTranscriptSessionRuntime.getTranscriptSessionInfo(),
  );
}

const pendingProjectionMessages = createPendingTranscriptMessages({
  storeTranscriptEntry: persistProjectionEntry,
  warn: console.warn,
});

subscribeDesktopTranscriptSessionRuntimeUpdates(() => {
  void flushPendingProjectionMessages();
});

export const DesktopTranscriptProjectionRuntimeClient = {
  recordUserMessage(
    text: string,
    options: TranscriptProjectionRecordOptions = {},
  ): void {
    const normalizedTransparency = normalizeTransparencyData(options.transparency);
    const retryOptions = {
      timestamp: options.timestamp,
      modelId: options.modelId,
      modelProvider: options.modelProvider,
      screenshotRef: options.screenshotRef,
      transparency: normalizedTransparency,
      structuredPayload: options.structuredPayload,
    };
    const queueForRetry = () => pendingProjectionMessages.queueUserMessageForRetry(text, retryOptions);
    recordImmediateTranscriptEntry({
      text,
      resolveSessionInfo: () => resolveSessionInfoOrQueue({
        conversationRef: options.conversationRef ?? null,
        userId: options.userId ?? null,
      }, queueForRetry),
      queueForRetry,
      buildEntry: (info) => ({
        messageId: options.messageId ?? null,
        content: text,
        role: 'user',
        messageType: 'user',
        timestamp: options.timestamp,
        modelId: options.modelId,
        modelProvider: options.modelProvider,
        screenshotRef: options.screenshotRef,
        transparency: normalizedTransparency,
        conversationRef: info.conversationRef,
        userId: info.userId,
      }),
      storeWithRetry: storeImmediateProjectionEntryWithRetry,
      warningMessage: '[DesktopTranscriptProjectionRuntimeClient] Failed to store immediate user projection entry; queued for retry',
    });
  },

  recordAssistantMessage(
    text: string,
    options: TranscriptProjectionRecordOptions = {},
  ): void {
    const messageType = options.messageType || 'llm-text';
    const normalizedTransparency = normalizeTransparencyData(options.transparency);
    const retryOptions = {
      messageType,
      timestamp: options.timestamp,
      modelId: options.modelId,
      modelProvider: options.modelProvider,
      screenshotRef: options.screenshotRef,
      transparency: normalizedTransparency,
      structuredPayload: options.structuredPayload,
    };
    const queueForRetry = () => pendingProjectionMessages.queueAssistantMessageForRetry(text, retryOptions);
    recordImmediateTranscriptEntry({
      text,
      resolveSessionInfo: () => resolveSessionInfoOrQueue(options, queueForRetry),
      queueForRetry,
      buildEntry: (info) => ({
        content: text,
        role: 'assistant',
        messageType,
        timestamp: options.timestamp,
        modelId: options.modelId,
        modelProvider: options.modelProvider,
        screenshotRef: options.screenshotRef,
        transparency: normalizedTransparency,
        structuredPayload: options.structuredPayload,
        conversationRef: info.conversationRef,
        userId: info.userId,
      }),
      storeWithRetry: storeImmediateProjectionEntryWithRetry,
      warningMessage: '[DesktopTranscriptProjectionRuntimeClient] Failed to store immediate assistant projection entry; queued for retry',
    });
  },

  recordToolMessage(
    text: string,
    options: TranscriptProjectionRecordOptions & {
      messageType: string;
    },
  ): void {
    const normalizedTransparency = normalizeTransparencyData(options.transparency);
    const retryOptions = {
      messageType: options.messageType,
      toolName: options.toolName,
      correlationId: options.correlationId,
      timestamp: options.timestamp,
      modelId: options.modelId,
      modelProvider: options.modelProvider,
      screenshotRef: options.screenshotRef,
      transparency: normalizedTransparency,
      structuredPayload: options.structuredPayload,
    };
    const queueForRetry = () => pendingProjectionMessages.queueToolMessageForRetry(text, retryOptions);
    recordImmediateTranscriptEntry({
      text,
      resolveSessionInfo: () => resolveSessionInfoOrQueue(options, queueForRetry),
      queueForRetry,
      buildEntry: (info) => ({
        content: text,
        role: options.messageType === 'tool-call' ? 'assistant' : 'tool',
        messageType: options.messageType,
        toolName: options.toolName,
        correlationId: options.correlationId,
        timestamp: options.timestamp,
        modelId: options.modelId,
        modelProvider: options.modelProvider,
        screenshotRef: options.screenshotRef,
        transparency: normalizedTransparency,
        structuredPayload: options.structuredPayload,
        conversationRef: info.conversationRef,
        userId: info.userId,
      }),
      storeWithRetry: storeImmediateProjectionEntryWithRetry,
      warningMessage: '[DesktopTranscriptProjectionRuntimeClient] Failed to store immediate tool projection entry; queued for retry',
    });
  },

  async replaceCompactedReplay(
    snapshot: CompactedReplaySnapshot,
    userId: string,
  ): Promise<void> {
    const store = createDesktopConversationStore(userId);
    await store.replaceCompactedReplay(snapshot);
  },

  async rewriteTranscriptProjection({
    conversationRef,
    userId,
    transcriptEntries,
    rehydrateEntries,
  }: RewriteTranscriptProjectionInput): Promise<RehydrateSnapshot> {
    return rewriteDesktopTranscriptProjection({
      conversationRef,
      userId,
      entries: transcriptEntries,
      rehydrateEntries,
    });
  },

  async loadRehydrateSnapshot({
    conversationRef,
    userId,
  }: LoadRehydrateSnapshotInput): Promise<RehydrateSnapshot> {
    const store = createDesktopConversationStore(userId);
    return store.loadForRehydrate(conversationRef);
  },

  async listMetadata(userId: string, options?: ListConversationOptions): Promise<ConversationMetadata[]> {
    const store = createDesktopConversationStore(userId);
    return store.listMetadata(options);
  },

  async loadForDisplay(userId: string, conversationRef: string): Promise<DisplayConversation> {
    const store = createDesktopConversationStore(userId);
    return store.loadForDisplay(conversationRef);
  },

  async deleteConversation(userId: string, conversationRef: string): Promise<void> {
    const store = createDesktopConversationStore(userId);
    await store.deleteConversation(conversationRef);
  },

  async createSeededConversationStore({
    conversationRef,
    userId,
    projectionEntries,
  }: SeededConversationStoreInput): Promise<ConversationStore> {
    const store = createDesktopConversationStore(userId);
    await rewriteDesktopTranscriptProjection({
      conversationRef,
      userId,
      entries: projectionEntries,
      rehydrateEntries: projectionEntries,
    });
    return store;
  },
};

export type {
  LoadRehydrateSnapshotInput,
  RewriteTranscriptProjectionInput,
  TranscriptProjectionRewriteEntry,
};
