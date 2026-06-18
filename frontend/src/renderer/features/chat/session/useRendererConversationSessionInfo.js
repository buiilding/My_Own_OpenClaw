/**
 * Provides the use renderer conversation session info module for the renderer UI.
 */

import { useMemo } from 'react';
import { useChatStore } from '../stores/chatStore';
import { useDesktopTranscriptSessionInfo } from '../../../app/runtime/desktopTranscriptSessionInfoRuntimeClient';
import { resolveRendererConversationSessionSnapshot } from './conversationSessionRuntime';

const EMPTY_RENDERER_SESSION_INFO = Object.freeze({
  conversationRef: null,
  userId: null,
});

export function useRendererConversationSessionInfo() {
  const transcriptSessionInfo = useDesktopTranscriptSessionInfo();
  const activeConversationRef = useChatStore((state) => state.activeConversationRef);

  return useMemo(() => {
    const nextSnapshot = resolveRendererConversationSessionSnapshot({
      transcriptConversationRef: transcriptSessionInfo?.conversationRef,
      storeConversationRef: activeConversationRef,
      userId: transcriptSessionInfo?.userId,
    });

    if (!nextSnapshot.conversationRef && !nextSnapshot.userId) {
      return EMPTY_RENDERER_SESSION_INFO;
    }

    return nextSnapshot;
  }, [
    activeConversationRef,
    transcriptSessionInfo?.conversationRef,
    transcriptSessionInfo?.userId,
  ]);
}
