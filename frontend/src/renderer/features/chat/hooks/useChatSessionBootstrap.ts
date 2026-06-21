/**
 * Provides the use chat session bootstrap module for the renderer UI.
 */

import { useCallback } from 'react';
import { DesktopClientSessionRuntimeClient } from '../../../app/runtime/desktopClientSessionRuntimeClient';
import { DesktopTranscriptSessionRuntimeClient } from '../../../app/runtime/desktopTranscriptSessionRuntimeClient';
import { useChatStore } from '../stores/chatStore';
import {
  DesktopConversationSessionRuntime,
} from '../../../app/runtime/desktopConversationSessionRuntime';

const {
  hydrateConversationSessionFromMainSnapshot,
} = DesktopConversationSessionRuntime;

export function useChatSessionBootstrap() {
  const setChatActiveConversationRef = useChatStore((state) => state.setActiveConversationRef);

  return useCallback(async () => {
    return hydrateConversationSessionFromMainSnapshot({
      loadMainSessionSnapshot: DesktopClientSessionRuntimeClient.loadMainSessionSnapshot,
      setTranscriptConversationRef: DesktopTranscriptSessionRuntimeClient.setActiveConversationRef,
      setChatConversationRef: setChatActiveConversationRef,
      updateTranscriptSession: DesktopTranscriptSessionRuntimeClient.updateTranscriptSession,
      onError: (error) => {
        console.warn('[chatSessionBootstrap] Failed to hydrate session snapshot:', error);
      },
    });
  }, [setChatActiveConversationRef]);
}
