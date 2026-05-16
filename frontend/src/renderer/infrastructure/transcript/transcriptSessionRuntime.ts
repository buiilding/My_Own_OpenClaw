import { IpcBridge, ON_CHANNELS, SEND_CHANNELS } from '../ipc/bridge';
import { extractTranscriptSessionSyncPayload } from './sessionSyncPayload';
import {
  emitSessionUpdateEvent,
  persistSessionInfoToStorage,
  readSessionInfoFromStorage,
} from './sessionInfoStorage';
import { createTranscriptSessionState } from './sessionInfoState';
import type { SessionInfo } from './types';

export type TranscriptSessionResolveOptions = {
  conversationRef?: string | null;
  userId?: string | null;
};

type TranscriptSessionRuntimeOptions = {
  onSessionUpdated?: () => void;
};

export function createTranscriptSessionRuntime({
  onSessionUpdated,
}: TranscriptSessionRuntimeOptions = {}) {
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
    onSessionUpdated?.();
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
