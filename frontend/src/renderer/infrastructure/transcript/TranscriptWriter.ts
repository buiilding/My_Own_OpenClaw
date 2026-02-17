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
  TranscriptEntry,
} from './types';

const sessionState = createTranscriptSessionState(readSessionInfoFromStorage);
const pendingAssistantQueue = createPendingAssistantQueue();
const pendingUserQueue = createPendingUserQueue();
const pendingToolQueue = createPendingToolQueue();

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
  } = {},
) => {
  pendingUserQueue.enqueue({
    text,
    timestamp: options.timestamp,
    modelId: options.modelId,
    modelProvider: options.modelProvider,
    screenshotRef: options.screenshotRef,
  });
};

const queueAssistantMessageForRetry = (
  text: string,
  options: {
    messageType?: string;
    modelId?: string | null;
    modelProvider?: string | null;
    screenshotRef?: string | null;
  } = {},
) => {
  pendingAssistantQueue.enqueue({
    text,
    messageType: options.messageType,
    modelId: options.modelId,
    modelProvider: options.modelProvider,
    screenshotRef: options.screenshotRef,
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
  options: {
    timestamp?: string;
    conversationRef?: string | null;
    sessionId?: string | null;
    userId?: string | null;
    modelId?: string | null;
    modelProvider?: string | null;
    screenshotRef?: string | null;
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
  } = options;
  const info = sessionState.resolve({
    conversationRef: conversationRef ?? sessionId ?? null,
    userId: userId ?? null,
  });

  if (!info.conversationRef || !info.userId) {
    queueUserMessageForRetry(text, { timestamp, modelId, modelProvider, screenshotRef });
    return;
  }

  void storeTranscriptEntry({
    content: text,
    role: 'user',
    messageType: 'user',
    timestamp,
    modelId,
    modelProvider,
    screenshotRef,
    conversationRef: info.conversationRef,
    userId: info.userId,
  }).catch((error) => {
    queueUserMessageForRetry(text, { timestamp, modelId, modelProvider, screenshotRef });
    console.warn(
      '[TranscriptWriter] Failed to store immediate user transcript entry; queued for retry',
      error,
    );
  });
};

export const recordAssistantMessage = (
  text: string,
  options: {
    messageType?: string;
    conversationRef?: string | null;
    sessionId?: string | null;
    userId?: string | null;
    modelId?: string | null;
    modelProvider?: string | null;
    screenshotRef?: string | null;
  } = {},
) => {
  if (!text) {
    return;
  }
  const info = sessionState.resolve({
    conversationRef: options.conversationRef ?? options.sessionId ?? null,
    userId: options.userId ?? null,
  });
  if (!info.conversationRef || !info.userId) {
    queueAssistantMessageForRetry(text, {
      messageType: options.messageType || 'llm-text',
      modelId: options.modelId,
      modelProvider: options.modelProvider,
      screenshotRef: options.screenshotRef,
    });
    return;
  }

  void storeTranscriptEntry({
    content: text,
    role: 'assistant',
    messageType: options.messageType || 'llm-text',
    modelId: options.modelId,
    modelProvider: options.modelProvider,
    screenshotRef: options.screenshotRef,
    conversationRef: info.conversationRef,
    userId: info.userId,
  }).catch((error) => {
    queueAssistantMessageForRetry(text, {
      messageType: options.messageType || 'llm-text',
      modelId: options.modelId,
      modelProvider: options.modelProvider,
      screenshotRef: options.screenshotRef,
    });
    console.warn(
      '[TranscriptWriter] Failed to store immediate assistant transcript entry; queued for retry',
      error,
    );
  });
};

export const recordToolMessage = (
  text: string,
  options: {
    messageType: string;
    toolName?: string;
    correlationId?: string;
    conversationRef?: string | null;
    sessionId?: string | null;
    userId?: string | null;
    modelId?: string | null;
    modelProvider?: string | null;
    screenshotRef?: string | null;
  },
) => {
  if (!text) {
    return;
  }
  const info = sessionState.resolve({
    conversationRef: options.conversationRef ?? options.sessionId ?? null,
    userId: options.userId ?? null,
  });
  if (!info.conversationRef || !info.userId) {
    queueToolMessageForRetry(text, {
      messageType: options.messageType,
      toolName: options.toolName,
      correlationId: options.correlationId,
      modelId: options.modelId,
      modelProvider: options.modelProvider,
      screenshotRef: options.screenshotRef,
    });
    return;
  }

  void storeTranscriptEntry({
    content: text,
    role: 'tool',
    messageType: options.messageType,
    toolName: options.toolName,
    correlationId: options.correlationId,
    modelId: options.modelId,
    modelProvider: options.modelProvider,
    screenshotRef: options.screenshotRef,
    conversationRef: info.conversationRef,
    userId: info.userId,
  }).catch((error) => {
    queueToolMessageForRetry(text, {
      messageType: options.messageType,
      toolName: options.toolName,
      correlationId: options.correlationId,
      modelId: options.modelId,
      modelProvider: options.modelProvider,
      screenshotRef: options.screenshotRef,
    });
    console.warn(
      '[TranscriptWriter] Failed to store immediate tool transcript entry; queued for retry',
      error,
    );
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
  });
};
