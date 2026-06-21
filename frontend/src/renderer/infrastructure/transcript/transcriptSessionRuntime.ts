/**
 * Coordinates the transcript session runtime for the renderer UI.
 */

import { IpcBridge } from '../ipc/bridge';
import { ON_CHANNELS, SEND_CHANNELS } from '../ipc/channels';
import { normalizeOptionalIncomingText } from '../text/incomingTextNormalization';
import {
  emitSessionUpdateEvent,
  persistSessionInfoToStorage,
  readSessionInfoFromStorage,
} from './sessionInfoStorage';
import { createTranscriptSessionState } from './sessionInfoState';
import type { SessionInfo } from './types';

type TranscriptSessionResolveOptions = {
  conversationRef?: string | null;
  userId?: string | null;
};

type TranscriptSessionSyncPayload = {
  conversationRef?: string | null;
  userId?: string | null;
};

const hasOwnProperty = (value: unknown, key: string): boolean => {
  return Boolean(value && typeof value === 'object' && Object.prototype.hasOwnProperty.call(value, key));
};

const normalizeOptionalSessionField = (value: unknown): string | null => {
  if (value === null) {
    return null;
  }
  return normalizeOptionalIncomingText(value);
};

const rejectRemovedSessionIdentityKeys = (payload: object): void => {
  if (hasOwnProperty(payload, 'sessionId') || hasOwnProperty(payload, 'session_id')) {
    throw new Error('Transcript session sync payloads must use conversationRef; sessionId and session_id are not supported.');
  }
  if (hasOwnProperty(payload, 'conversation_ref') || hasOwnProperty(payload, 'user_id')) {
    throw new Error('Transcript session sync payloads must use conversationRef and userId; conversation_ref and user_id are not supported.');
  }
};

const extractTranscriptSessionSyncPayload = (
  payload: unknown,
): TranscriptSessionSyncPayload | null => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return null;
  }

  rejectRemovedSessionIdentityKeys(payload);

  const hasConversationRef = hasOwnProperty(payload, 'conversationRef');
  const hasUserId = hasOwnProperty(payload, 'userId');
  if (!hasConversationRef && !hasUserId) {
    return null;
  }

  return {
    conversationRef: hasConversationRef
      ? normalizeOptionalSessionField((payload as { conversationRef?: unknown }).conversationRef)
      : undefined,
    userId: hasUserId
      ? normalizeOptionalSessionField((payload as { userId?: unknown }).userId)
      : undefined,
  };
};

export function createTranscriptSessionRuntime() {
  const sessionState = createTranscriptSessionState(readSessionInfoFromStorage);
  let transcriptSessionSyncSubscribed = false;

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
      console.warn('[DesktopTranscriptSessionRuntimeClient] Failed to sync transcript session to main process:', error);
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
    return nextInfo;
  };

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
      console.warn('[DesktopTranscriptSessionRuntimeClient] Failed to subscribe to transcript session sync channel:', error);
    }
  };

  const resolveSessionInfoFromOptions = (
    options: TranscriptSessionResolveOptions,
  ): SessionInfo => {
    return sessionState.resolve({
      conversationRef: options.conversationRef ?? null,
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

  subscribeToTranscriptSessionSync();

  return {
    sessionState,
    applyTranscriptSessionUpdate,
    getActiveConversationRef: (): string | null => sessionState.get().conversationRef,
    getTranscriptSessionInfo: (): SessionInfo => sessionState.get(),
    resolveSessionInfoFromOptions,
    resolveSessionInfoOrQueue,
  };
}
