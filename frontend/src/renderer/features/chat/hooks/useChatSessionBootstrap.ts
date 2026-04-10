import { useCallback } from 'react';
import { IpcBridge, INVOKE_CHANNELS } from '../../../infrastructure/ipc/bridge';
import {
  setActiveConversationRef as setTranscriptConversationRef,
  updateTranscriptSession,
} from '../../../infrastructure/transcript/TranscriptWriter';
import { markConversationInferenceSessionUnknown } from '../session/conversationInferenceSessionRuntime';
import { useChatStore } from '../stores/chatStore';
import {
  hydrateConversationSessionFromMainSnapshot,
} from '../session/conversationSessionRuntime';

export function useChatSessionBootstrap() {
  const setChatActiveConversationRef = useChatStore((state) => state.setActiveConversationRef);

  return useCallback(async () => {
    return hydrateConversationSessionFromMainSnapshot({
      loadMainSessionSnapshot: () => IpcBridge.invoke(INVOKE_CHANNELS.GET_CLIENT_USER_ID),
      setTranscriptConversationRef,
      setChatConversationRef: setChatActiveConversationRef,
      updateTranscriptSession,
      markConversationInferenceSessionUnknown,
      onError: (error) => {
        console.warn('[chatSessionBootstrap] Failed to hydrate session snapshot:', error);
      },
    });
  }, [setChatActiveConversationRef]);
}
