/**
 * Provides the use renderer conversation session info module for the renderer UI.
 */

import { useMemo } from 'react';
import { useChatStore } from '../stores/chatStore';
import { useDesktopTranscriptSessionInfo } from '../../../app/runtime/desktopTranscriptSessionInfoRuntimeClient';
import { DesktopConversationSessionRuntime } from '../../../app/runtime/desktopConversationSessionRuntime';

const {
  resolveCurrentRendererConversationSessionInfo,
} = DesktopConversationSessionRuntime;

export function useRendererConversationSessionInfo() {
  const transcriptSessionInfo = useDesktopTranscriptSessionInfo();
  const activeConversationRef = useChatStore((state) => state.activeConversationRef);
  const transcriptConversationRef = transcriptSessionInfo?.conversationRef;
  const transcriptUserId = transcriptSessionInfo?.userId;

  return useMemo(() => resolveCurrentRendererConversationSessionInfo({
    transcriptSessionInfo: {
      conversationRef: transcriptConversationRef,
      userId: transcriptUserId,
    },
    activeConversationRef,
  }), [
    activeConversationRef,
    transcriptConversationRef,
    transcriptUserId,
  ]);
}
