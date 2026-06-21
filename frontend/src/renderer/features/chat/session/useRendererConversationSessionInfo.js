/**
 * Provides the use renderer conversation session info module for the renderer UI.
 */

import { useMemo } from 'react';
import { useChatStore } from '../stores/chatStore';
import { useDesktopTranscriptSessionInfo } from '../../../app/runtime/desktopTranscriptSessionInfoRuntimeClient';
import { resolveCurrentRendererConversationSessionInfo } from '../../../app/runtime/desktopConversationSessionRuntime';

export function useRendererConversationSessionInfo() {
  const transcriptSessionInfo = useDesktopTranscriptSessionInfo();
  const activeConversationRef = useChatStore((state) => state.activeConversationRef);

  return useMemo(() => resolveCurrentRendererConversationSessionInfo({
    transcriptSessionInfo,
    activeConversationRef,
  }), [
    activeConversationRef,
    transcriptSessionInfo?.conversationRef,
    transcriptSessionInfo?.userId,
  ]);
}
