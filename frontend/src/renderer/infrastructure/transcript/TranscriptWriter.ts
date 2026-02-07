import { IpcBridge, INVOKE_CHANNELS } from '../ipc/bridge';
import { createPendingUserQueue } from './pendingUserQueue';
import { emitSessionUpdateEvent, persistSessionInfoToStorage, readSessionInfoFromStorage } from './sessionInfoStorage';
import { createTranscriptSessionState } from './sessionInfoState';
import type { SessionInfo, TranscriptEntry } from './types';

const sessionState = createTranscriptSessionState(readSessionInfoFromStorage);
const pendingUserQueue = createPendingUserQueue();

const flushPendingUserMessages = async () => {
  const currentInfo = sessionState.get();
  if (!currentInfo.sessionId || !currentInfo.userId || pendingUserQueue.size() === 0) {
    return;
  }

  const pendingMessages = pendingUserQueue.drain();
  for (const message of pendingMessages) {
    await storeTranscriptEntry({
      content: message.text,
      role: 'user',
      messageType: 'user',
      timestamp: message.timestamp,
      modelId: message.modelId,
      modelProvider: message.modelProvider,
      screenshotRef: message.screenshotRef,
    });
  }
};

export const updateTranscriptSession = (sessionId?: string | null, userId?: string | null) => {
  const info = sessionState.update(sessionId, userId);
  persistSessionInfoToStorage(info);
  emitSessionUpdateEvent(info);
  void flushPendingUserMessages();
};

export const getTranscriptSessionInfo = (): SessionInfo => {
  return sessionState.get();
};

export const recordUserMessage = (
  text: string,
  options: {
    timestamp?: string;
    sessionId?: string | null;
    userId?: string | null;
    modelId?: string | null;
    modelProvider?: string | null;
    screenshotRef?: string | null;
  } = {}
) => {
  if (!text) {
    return;
  }
  const { sessionId, userId, timestamp, modelId, modelProvider, screenshotRef } = options;
  const info = sessionState.resolve({ sessionId: sessionId ?? null, userId: userId ?? null });

  if (!info.sessionId || !info.userId) {
    pendingUserQueue.enqueue({ text, timestamp, modelId, modelProvider, screenshotRef });
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
    sessionId: info.sessionId,
    userId: info.userId,
  });
};

export const recordAssistantMessage = (
  text: string,
  options: {
    messageType?: string;
    sessionId?: string | null;
    userId?: string | null;
    modelId?: string | null;
    modelProvider?: string | null;
    screenshotRef?: string | null;
  } = {}
) => {
  if (!text) {
    return;
  }
  const info = sessionState.resolve({ sessionId: options.sessionId ?? null, userId: options.userId ?? null });
  if (!info.sessionId || !info.userId) {
    return;
  }

  void storeTranscriptEntry({
    content: text,
    role: 'assistant',
    messageType: options.messageType || 'llm-text',
    modelId: options.modelId,
    modelProvider: options.modelProvider,
    screenshotRef: options.screenshotRef,
    sessionId: info.sessionId,
    userId: info.userId,
  });
};

export const recordToolMessage = (
  text: string,
  options: {
    messageType: string;
    toolName?: string;
    correlationId?: string;
    sessionId?: string | null;
    userId?: string | null;
    modelId?: string | null;
    modelProvider?: string | null;
    screenshotRef?: string | null;
  }
) => {
  if (!text) {
    return;
  }
  const info = sessionState.resolve({ sessionId: options.sessionId ?? null, userId: options.userId ?? null });
  if (!info.sessionId || !info.userId) {
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
    sessionId: info.sessionId,
    userId: info.userId,
  });
};

const storeTranscriptEntry = async (entry: TranscriptEntry) => {
  const info = sessionState.resolve({ sessionId: entry.sessionId ?? null, userId: entry.userId ?? null });
  if (!info.sessionId || !info.userId) {
    return;
  }

  await IpcBridge.invoke(INVOKE_CHANNELS.STORE_TRANSCRIPT, {
    content: entry.content,
    userId: info.userId,
    sessionId: info.sessionId,
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
