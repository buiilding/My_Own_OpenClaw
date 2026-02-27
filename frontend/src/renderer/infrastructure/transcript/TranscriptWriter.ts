import { IpcBridge, INVOKE_CHANNELS } from '../ipc/bridge';
import { createPendingAssistantQueue } from './pendingAssistantQueue';
import { createPendingUserQueue } from './pendingUserQueue';
import { createPendingToolQueue } from './pendingToolQueue';
import {
  emitSessionUpdateEvent,
  persistSessionInfoToStorage,
  readSessionInfoFromStorage,
} from './sessionInfoStorage';
import { createTranscriptSessionState } from './sessionInfoState';
import type {
  PendingAssistantMessage,
  PendingToolMessage,
  PendingUserMessage,
  SessionInfo,
  TranscriptTransparencyData,
  TranscriptEntry,
} from './types';

const sessionState = createTranscriptSessionState(readSessionInfoFromStorage);
const pendingAssistantQueue = createPendingAssistantQueue();
const pendingUserQueue = createPendingUserQueue();
const pendingToolQueue = createPendingToolQueue();

const normalizeOptionalString = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
};

const normalizeTransparencyData = (
  transparency: TranscriptTransparencyData | null | undefined,
): TranscriptTransparencyData | null => {
  if (!transparency || typeof transparency !== 'object') {
    return null;
  }

  const normalized: TranscriptTransparencyData = {};
  const systemPrompt = normalizeOptionalString(transparency.systemPrompt);
  if (systemPrompt) {
    normalized.systemPrompt = systemPrompt;
  }

  if (Array.isArray(transparency.toolSchemas) && transparency.toolSchemas.length > 0) {
    normalized.toolSchemas = [...transparency.toolSchemas];
  }

  const fullUserContent = normalizeOptionalString(transparency.fullUserMessage?.content);
  const fullUserMetadata = (
    transparency.fullUserMessage?.metadata
    && typeof transparency.fullUserMessage.metadata === 'object'
    && !Array.isArray(transparency.fullUserMessage.metadata)
  )
    ? { ...transparency.fullUserMessage.metadata }
    : null;
  if (fullUserContent || fullUserMetadata) {
    normalized.fullUserMessage = {
      content: fullUserContent || undefined,
      metadata: fullUserMetadata || undefined,
    };
  }

  const fullAssistantContent = normalizeOptionalString(transparency.fullAssistantMessage?.content);
  if (fullAssistantContent) {
    normalized.fullAssistantMessage = {
      content: fullAssistantContent,
    };
  }

  return Object.keys(normalized).length > 0 ? normalized : null;
};

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

const requeuePending = <T>(messages: T[], enqueue: (message: T) => void) => {
  for (const message of messages) {
    enqueue(message);
  }
};

const flushPendingEntries = async <T>(
  messages: T[],
  toTranscriptEntry: (message: T) => TranscriptEntry,
  requeue: (messages: T[]) => void,
  category: 'user' | 'assistant' | 'tool',
): Promise<boolean> => {
  for (let index = 0; index < messages.length; index += 1) {
    const message = messages[index];
    try {
      await storeTranscriptEntry(toTranscriptEntry(message));
    } catch (error) {
      requeue(messages.slice(index));
      console.warn(
        `[TranscriptWriter] Failed to flush pending ${category} transcript entries; requeued ${messages.length - index}`,
        error,
      );
      return false;
    }
  }
  return true;
};

const flushPendingMessages = async () => {
  const currentInfo = sessionState.get();
  if (
    !currentInfo.conversationRef
    || !currentInfo.userId
    || (
      pendingUserQueue.size() === 0
      && pendingAssistantQueue.size() === 0
      && pendingToolQueue.size() === 0
    )
  ) {
    return;
  }

  const pendingUserMessages = pendingUserQueue.drain();
  const flushedUserMessages = await flushPendingEntries<PendingUserMessage>(
    pendingUserMessages,
    (message) => ({
      content: message.text,
      role: 'user',
      messageType: 'user',
      timestamp: message.timestamp,
      modelId: message.modelId,
      modelProvider: message.modelProvider,
      screenshotRef: message.screenshotRef,
      transparency: message.transparency,
    }),
    (messages) => requeuePending(messages, pendingUserQueue.enqueue),
    'user',
  );
  if (!flushedUserMessages) {
    return;
  }

  const pendingAssistantMessages = pendingAssistantQueue.drain();
  const flushedAssistantMessages = await flushPendingEntries<PendingAssistantMessage>(
    pendingAssistantMessages,
    (message) => ({
      content: message.text,
      role: 'assistant',
      messageType: message.messageType || 'llm-text',
      modelId: message.modelId,
      modelProvider: message.modelProvider,
      screenshotRef: message.screenshotRef,
      transparency: message.transparency,
    }),
    (messages) => requeuePending(messages, pendingAssistantQueue.enqueue),
    'assistant',
  );
  if (!flushedAssistantMessages) {
    return;
  }

  const pendingToolMessages = pendingToolQueue.drain();
  await flushPendingEntries<PendingToolMessage>(
    pendingToolMessages,
    (message) => ({
      content: message.text,
      role: 'tool',
      messageType: message.messageType,
      toolName: message.toolName || undefined,
      correlationId: message.correlationId || undefined,
      modelId: message.modelId,
      modelProvider: message.modelProvider,
      screenshotRef: message.screenshotRef,
      transparency: message.transparency,
    }),
    (messages) => requeuePending(messages, pendingToolQueue.enqueue),
    'tool',
  );
};

const queueUserMessageForRetry = (
  text: string,
  options: {
    timestamp?: string;
    modelId?: string | null;
    modelProvider?: string | null;
    screenshotRef?: string | null;
    transparency?: TranscriptTransparencyData | null;
  } = {},
) => {
  pendingUserQueue.enqueue({
    text,
    timestamp: options.timestamp,
    modelId: options.modelId,
    modelProvider: options.modelProvider,
    screenshotRef: options.screenshotRef,
    transparency: options.transparency,
  });
};

const queueAssistantMessageForRetry = (
  text: string,
  options: {
    messageType?: string;
    modelId?: string | null;
    modelProvider?: string | null;
    screenshotRef?: string | null;
    transparency?: TranscriptTransparencyData | null;
  } = {},
) => {
  pendingAssistantQueue.enqueue({
    text,
    messageType: options.messageType,
    modelId: options.modelId,
    modelProvider: options.modelProvider,
    screenshotRef: options.screenshotRef,
    transparency: options.transparency,
  });
};

const queueToolMessageForRetry = (
  text: string,
  options: {
    messageType: string;
    toolName?: string;
    correlationId?: string;
    modelId?: string | null;
    modelProvider?: string | null;
    screenshotRef?: string | null;
    transparency?: TranscriptTransparencyData | null;
  },
) => {
  pendingToolQueue.enqueue({
    text,
    messageType: options.messageType,
    toolName: options.toolName,
    correlationId: options.correlationId,
    modelId: options.modelId,
    modelProvider: options.modelProvider,
    screenshotRef: options.screenshotRef,
    transparency: options.transparency,
  });
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
  const previousInfo = sessionState.get();
  const nextInfo = sessionState.update(conversationRef, userId);
  persistAndEmitSessionInfoIfChanged(previousInfo, nextInfo);
  void flushPendingMessages();
};

export const setActiveConversationRef = (conversationRef: string | null) => {
  const previousInfo = sessionState.get();
  const nextInfo = sessionState.update(conversationRef, undefined);
  persistAndEmitSessionInfoIfChanged(previousInfo, nextInfo);
  void flushPendingMessages();
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
  if (!text) {
    return;
  }
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
  const queueForRetry = () => queueUserMessageForRetry(text, retryOptions);
  const info = resolveSessionInfoOrQueue(
    { conversationRef, sessionId, userId },
    queueForRetry,
  );
  if (!info) {
    return;
  }

  storeImmediateTranscriptEntryWithRetry({
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
  }, queueForRetry, '[TranscriptWriter] Failed to store immediate user transcript entry; queued for retry');
};

export const recordAssistantMessage = (
  text: string,
  options: TranscriptRecordContextOptions & {
    messageType?: string;
  } = {},
) => {
  if (!text) {
    return;
  }
  const messageType = options.messageType || 'llm-text';
  const normalizedTransparency = normalizeTransparencyData(options.transparency);
  const retryOptions = {
    messageType,
    modelId: options.modelId,
    modelProvider: options.modelProvider,
    screenshotRef: options.screenshotRef,
    transparency: normalizedTransparency,
  };
  const queueForRetry = () => queueAssistantMessageForRetry(text, retryOptions);
  const info = resolveSessionInfoOrQueue(options, queueForRetry);
  if (!info) {
    return;
  }

  storeImmediateTranscriptEntryWithRetry({
    content: text,
    role: 'assistant',
    messageType,
    modelId: options.modelId,
    modelProvider: options.modelProvider,
    screenshotRef: options.screenshotRef,
    transparency: normalizedTransparency,
    conversationRef: info.conversationRef,
    userId: info.userId,
  }, queueForRetry, '[TranscriptWriter] Failed to store immediate assistant transcript entry; queued for retry');
};

export const recordToolMessage = (
  text: string,
  options: TranscriptRecordContextOptions & {
    messageType: string;
    toolName?: string;
    correlationId?: string;
  },
) => {
  if (!text) {
    return;
  }
  const retryOptions = {
    messageType: options.messageType,
    toolName: options.toolName,
    correlationId: options.correlationId,
    modelId: options.modelId,
    modelProvider: options.modelProvider,
    screenshotRef: options.screenshotRef,
    transparency: normalizeTransparencyData(options.transparency),
  };
  const queueForRetry = () => queueToolMessageForRetry(text, retryOptions);
  const info = resolveSessionInfoOrQueue(options, queueForRetry);
  if (!info) {
    return;
  }

  storeImmediateTranscriptEntryWithRetry({
    content: text,
    role: 'tool',
    messageType: options.messageType,
    toolName: options.toolName,
    correlationId: options.correlationId,
    modelId: options.modelId,
    modelProvider: options.modelProvider,
    screenshotRef: options.screenshotRef,
    transparency: retryOptions.transparency,
    conversationRef: info.conversationRef,
    userId: info.userId,
  }, queueForRetry, '[TranscriptWriter] Failed to store immediate tool transcript entry; queued for retry');
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
