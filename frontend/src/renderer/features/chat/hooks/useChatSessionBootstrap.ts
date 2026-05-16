import { useCallback } from 'react';
import { IpcBridge, INVOKE_CHANNELS } from '../../../infrastructure/ipc/bridge';
import { markConversationInferenceSessionUnknown } from '../session/conversationInferenceSessionRuntime';
import { DesktopConversationRuntimeClient } from '../session/desktopConversationRuntimeClient';
import { useChatStore } from '../stores/chatStore';
import {
  hydrateConversationSessionFromMainSnapshot,
} from '../session/conversationSessionRuntime';

export function useChatSessionBootstrap() {
  const setChatActiveConversationRef = useChatStore((state) => state.setActiveConversationRef);

  return useCallback(async () => {
    return hydrateConversationSessionFromMainSnapshot({
      loadMainSessionSnapshot: () => IpcBridge.invoke(INVOKE_CHANNELS.GET_CLIENT_USER_ID),
      setTranscriptConversationRef: DesktopConversationRuntimeClient.setActiveConversationRef,
      setChatConversationRef: setChatActiveConversationRef,
      updateTranscriptSession: DesktopConversationRuntimeClient.updateTranscriptSession,
      markConversationInferenceSessionUnknown,
      onError: (error) => {
        console.warn('[chatSessionBootstrap] Failed to hydrate session snapshot:', error);
      },
    });
  }, [setChatActiveConversationRef]);
}
