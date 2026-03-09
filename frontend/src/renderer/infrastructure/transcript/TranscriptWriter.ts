import { IpcBridge, INVOKE_CHANNELS, ON_CHANNELS, SEND_CHANNELS } from '../ipc/bridge';
import { createPendingTranscriptMessages } from './pending/pendingTranscriptMessages';
import { extractTranscriptSessionSyncPayload } from './sessionSyncPayload';
import {
  emitSessionUpdateEvent,
  persistSessionInfoToStorage,
  readSessionInfoFromStorage,
} from './sessionInfoStorage';
import { createTranscriptSessionState } from './sessionInfoState';
import { normalizeTransparencyData } from './transparencyNormalization';
import { recordImmediateTranscriptEntry } from './transcriptRecordWrite';
import type {
  SessionInfo,
  TranscriptTransparencyData,
  TranscriptEntry,
} from './types';

const sessionState = createTranscriptSessionState(readSessionInfoFromStorage);

const sessionInfoChanged = (previous: SessionInfo, next: SessionInfo): boolean => (
  previous.conversationRef !== next.conversationRef
  || previous.userId !== next.userId
);

const persistAndEmitSessionInfoIfChanged = (previous: SessionInfo, next: SessionInfo) => {
  if (!sessionInfoChanged(previous, next)) {
    return;
  }
  persistSessionInfoToStorage(next);
  emitSessionUpdateEvent(next);
};

const syncSessionInfoToMainProcess = (info: SessionInfo) => {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    IpcBridge.send(SEND_CHANNELS.TRANSCRIPT_SESSION_SYNC, {
      conversationRef: info.conversationRef,
      userId: info.userId,
    });
  } catch (error) {
    console.warn('[TranscriptWriter] Failed to sync transcript session to main process:', error);
  }
};

const applyTranscriptSessionUpdate = (
  conversationRef: string | null | undefined,
  userId: string | null | undefined,
  options: {
    syncToMainProcess?: boolean;
  } = {},
): SessionInfo => {
  const { syncToMainProcess = true } = options;
  const previousInfo = sessionState.get();
  const nextInfo = sessionState.update(conversationRef, userId);
  persistAndEmitSessionInfoIfChanged(previousInfo, nextInfo);
  if (syncToMainProcess) {
    syncSessionInfoToMainProcess(nextInfo);
  }
  void flushPendingMessages();
  return nextInfo;
};

let transcriptSessionSyncSubscribed = false;

const subscribeToTranscriptSessionSync = () => {
  if (transcriptSessionSyncSubscribed || typeof window === 'undefined') {
    return;
  }

  transcriptSessionSyncSubscribed = true;
  try {
    IpcBridge.on(ON_CHANNELS.TRANSCRIPT_SESSION_SYNC, (payload) => {
      const normalized = extractTranscriptSessionSyncPayload(payload);
      if (!normalized) {
        return;
      }
      applyTranscriptSessionUpdate(
        normalized.conversationRef,
        normalized.userId,
        { syncToMainProcess: false },
      );
    });
  } catch (error) {
    transcriptSessionSyncSubscribed = false;
    console.warn('[TranscriptWriter] Failed to subscribe to transcript session sync channel:', error);
  }
};

subscribeToTranscriptSessionSync();

const flushPendingMessages = async () => {
  if (!pendingTranscriptMessages.hasPendingEntries()) {
    return;
  }
  await pendingTranscriptMessages.flushPendingMessages(sessionState.get());
};

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

type TranscriptSessionResolveOptions = {
  conversationRef?: string | null;
  sessionId?: string | null;
  userId?: string | null;
};

type TranscriptRecordContextOptions = TranscriptSessionResolveOptions & {
  modelId?: string | null;
  modelProvider?: string | null;
  screenshotRef?: string | null;
  transparency?: TranscriptTransparencyData | null;
};

const resolveSessionInfoFromOptions = (
  options: TranscriptSessionResolveOptions,
): SessionInfo => {
  return sessionState.resolve({
    conversationRef: options.conversationRef ?? options.sessionId ?? null,
    userId: options.userId ?? null,
  });
};

const resolveSessionInfoOrQueue = (
  options: TranscriptSessionResolveOptions,
  queueForRetry: () => void,
): SessionInfo | null => {
  const info = resolveSessionInfoFromOptions(options);
  if (!info.conversationRef || !info.userId) {
    queueForRetry();
    return null;
  }
  return info;
};

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
  applyTranscriptSessionUpdate(conversationRef, userId, { syncToMainProcess: true });
};

export const setActiveConversationRef = (conversationRef: string | null) => {
  applyTranscriptSessionUpdate(conversationRef, undefined, { syncToMainProcess: true });
};

export const getActiveConversationRef = (): string | null => {
  return sessionState.get().conversationRef;
};

export const getTranscriptSessionInfo = (): SessionInfo => {
  return sessionState.get();
};

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
      conversationRef: info.conversationRef,
      userId: info.userId,
    }),
    storeWithRetry: storeImmediateTranscriptEntryWithRetry,
    warningMessage: '[TranscriptWriter] Failed to store immediate tool transcript entry; queued for retry',
  });
};

const storeTranscriptEntry = async (entry: TranscriptEntry) => {
  const info = sessionState.resolve({
    conversationRef: entry.conversationRef ?? null,
    userId: entry.userId ?? null,
  });
  if (!info.conversationRef || !info.userId) {
    return;
  }

  await IpcBridge.invoke(INVOKE_CHANNELS.STORE_TRANSCRIPT, {
    content: entry.content,
    userId: info.userId,
    conversationRef: info.conversationRef,
    role: entry.role,
    messageType: entry.messageType,
    toolName: entry.toolName,
    correlationId: entry.correlationId,
    modelId: entry.modelId,
    modelProvider: entry.modelProvider,
    screenshot: entry.screenshotRef,
    timestamp: entry.timestamp,
    ...(entry.transparency ? { transparency: entry.transparency } : {}),
  });
  emitTranscriptEntryStoredEvent(entry, info);
};

const pendingTranscriptMessages = createPendingTranscriptMessages({
  storeTranscriptEntry,
  warn: console.warn,
});
