import { createPendingTranscriptMessages } from './pending/pendingTranscriptMessages';
import { normalizeTransparencyData } from './transparencyNormalization';
import { recordImmediateTranscriptEntry } from './transcriptRecordWrite';
import { createTranscriptSessionRuntime, type TranscriptSessionResolveOptions } from './transcriptSessionRuntime';
import { storeTranscriptEntry as persistTranscriptEntry } from './transcriptEntryPersistence';
import { ElectronSidecarConversationStore } from './ElectronSidecarConversationStore';
import type {
  SessionInfo,
  TranscriptStructuredToolPayload,
  TranscriptTransparencyData,
  TranscriptEntry,
} from './types';

const flushPendingMessages = async () => {
  if (!pendingTranscriptMessages.hasPendingEntries()) {
    return;
  }
  await pendingTranscriptMessages.flushPendingMessages(sessionRuntime.getTranscriptSessionInfo());
};

const sessionRuntime = createTranscriptSessionRuntime({
  onSessionUpdated: () => {
    void flushPendingMessages();
  },
});

const emitTranscriptEntryStoredEvent = (
  entry: TranscriptEntry,
  info: SessionInfo,
) => {
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
};

type TranscriptRecordContextOptions = TranscriptSessionResolveOptions & {
  modelId?: string | null;
  modelProvider?: string | null;
  screenshotRef?: string | null;
  transparency?: TranscriptTransparencyData | null;
  structuredPayload?: TranscriptStructuredToolPayload | null;
};

const resolveSessionInfoFromOptions = (
  options: TranscriptSessionResolveOptions,
) => sessionRuntime.resolveSessionInfoFromOptions(options);

const resolveSessionInfoOrQueue = (
  options: TranscriptSessionResolveOptions,
  queueForRetry: () => void,
) => sessionRuntime.resolveSessionInfoOrQueue(options, queueForRetry);

const storeImmediateTranscriptEntryWithRetry = (
  entry: TranscriptEntry,
  queueForRetry: () => void,
  warningMessage: string,
) => {
  void storeTranscriptEntry(entry).catch((error) => {
    queueForRetry();
    console.warn(warningMessage, error);
  });
};

export const updateTranscriptSession = (
  conversationRef?: string | null,
  userId?: string | null,
) => {
  sessionRuntime.applyTranscriptSessionUpdate(conversationRef, userId, { syncToMainProcess: true });
};

export const setActiveConversationRef = (conversationRef: string | null) => {
  sessionRuntime.applyTranscriptSessionUpdate(conversationRef, undefined, { syncToMainProcess: true });
};

export const getActiveConversationRef = (): string | null => {
  return sessionRuntime.getActiveConversationRef();
};

export const getTranscriptSessionInfo = () => sessionRuntime.getTranscriptSessionInfo();

export const recordUserMessage = (
  text: string,
  options: TranscriptRecordContextOptions & {
    timestamp?: string;
  } = {},
) => {
  const {
    conversationRef,
    sessionId,
    userId,
    timestamp,
    modelId,
    modelProvider,
    screenshotRef,
    transparency,
  } = options;
  const normalizedTransparency = normalizeTransparencyData(transparency);
  const retryOptions = {
    timestamp,
    modelId,
    modelProvider,
    screenshotRef,
    transparency: normalizedTransparency,
  };
  const queueForRetry = () => pendingTranscriptMessages.queueUserMessageForRetry(text, retryOptions);
  recordImmediateTranscriptEntry({
    text,
    resolveSessionInfo: () => resolveSessionInfoOrQueue(
      { conversationRef, sessionId, userId },
      queueForRetry,
    ),
    queueForRetry,
    buildEntry: (info) => ({
      content: text,
      role: 'user',
      messageType: 'user',
      timestamp,
      modelId,
      modelProvider,
      screenshotRef,
      transparency: normalizedTransparency,
      conversationRef: info.conversationRef,
      userId: info.userId,
    }),
    storeWithRetry: storeImmediateTranscriptEntryWithRetry,
    warningMessage: '[TranscriptWriter] Failed to store immediate user transcript entry; queued for retry',
  });
};

export const recordAssistantMessage = (
  text: string,
  options: TranscriptRecordContextOptions & {
    messageType?: string;
  } = {},
) => {
  const messageType = options.messageType || 'llm-text';
  const normalizedTransparency = normalizeTransparencyData(options.transparency);
  const retryOptions = {
    messageType,
    modelId: options.modelId,
    modelProvider: options.modelProvider,
    screenshotRef: options.screenshotRef,
    transparency: normalizedTransparency,
  };
  const queueForRetry = () => pendingTranscriptMessages.queueAssistantMessageForRetry(text, retryOptions);
  recordImmediateTranscriptEntry({
    text,
    resolveSessionInfo: () => resolveSessionInfoOrQueue(options, queueForRetry),
    queueForRetry,
    buildEntry: (info) => ({
      content: text,
      role: 'assistant',
      messageType,
      modelId: options.modelId,
      modelProvider: options.modelProvider,
      screenshotRef: options.screenshotRef,
      transparency: normalizedTransparency,
      conversationRef: info.conversationRef,
      userId: info.userId,
    }),
    storeWithRetry: storeImmediateTranscriptEntryWithRetry,
    warningMessage: '[TranscriptWriter] Failed to store immediate assistant transcript entry; queued for retry',
  });
};

export const recordToolMessage = (
  text: string,
  options: TranscriptRecordContextOptions & {
    messageType: string;
    toolName?: string;
    correlationId?: string;
  },
) => {
  const retryOptions = {
    messageType: options.messageType,
    toolName: options.toolName,
    correlationId: options.correlationId,
    modelId: options.modelId,
    modelProvider: options.modelProvider,
    screenshotRef: options.screenshotRef,
    transparency: normalizeTransparencyData(options.transparency),
    structuredPayload: options.structuredPayload,
  };
  const queueForRetry = () => pendingTranscriptMessages.queueToolMessageForRetry(text, retryOptions);
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
      modelId: options.modelId,
      modelProvider: options.modelProvider,
      screenshotRef: options.screenshotRef,
      transparency: retryOptions.transparency,
      structuredPayload: retryOptions.structuredPayload,
      conversationRef: info.conversationRef,
      userId: info.userId,
    }),
    storeWithRetry: storeImmediateTranscriptEntryWithRetry,
    warningMessage: '[TranscriptWriter] Failed to store immediate tool transcript entry; queued for retry',
  });
};

const storeTranscriptEntry = async (entry: TranscriptEntry) => {
  await persistTranscriptEntry(entry, {
    resolveSessionInfoForEntry: (targetEntry) => resolveSessionInfoFromOptions({
      conversationRef: targetEntry.conversationRef ?? null,
      userId: targetEntry.userId ?? null,
    }),
    createConversationStore: (userId) => new ElectronSidecarConversationStore({ userId }),
    emitStoredEvent: emitTranscriptEntryStoredEvent,
  });
};

const pendingTranscriptMessages = createPendingTranscriptMessages({
  storeTranscriptEntry,
  warn: console.warn,
});
