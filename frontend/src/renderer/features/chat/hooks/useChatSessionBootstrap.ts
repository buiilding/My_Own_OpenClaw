import { useCallback } from 'react';
import { IpcBridge, INVOKE_CHANNELS } from '../../../infrastructure/ipc/bridge';
import {
  setActiveConversationRef as setTranscriptConversationRef,
  updateTranscriptSession,
} from '../../../infrastructure/transcript/TranscriptWriter';
import { useChatStore } from '../stores/chatStore';
import { normalizeMainSessionSnapshot } from '../session/conversationSessionRuntime';

export function useChatSessionBootstrap() {
  const setChatActiveConversationRef = useChatStore((state) => state.setActiveConversationRef);

  return useCallback(async () => {
    try {
      const snapshotPayload = await IpcBridge.invoke(INVOKE_CHANNELS.GET_CLIENT_USER_ID);
      const snapshot = normalizeMainSessionSnapshot(snapshotPayload);
      if (!snapshot.conversationRef && !snapshot.userId) {
        return snapshot;
      }

      if (snapshot.conversationRef) {
        setTranscriptConversationRef(snapshot.conversationRef);
        setChatActiveConversationRef(snapshot.conversationRef);
      }
      updateTranscriptSession(snapshot.conversationRef, snapshot.userId);
      return snapshot;
    } catch (error) {
      console.warn('[chatSessionBootstrap] Failed to hydrate session snapshot:', error);
      return { conversationRef: null, userId: null };
    }
  }, [setChatActiveConversationRef]);
}
