/**
 * Projects use conversation session state for the renderer UI.
 */

import { useEffect } from 'react';
import { useChatStore } from '../stores/chatStore';
import { DesktopConversationSessionRuntime } from '../../../app/runtime/desktopConversationSessionRuntime';

const {
  applyChatConversationProjection,
} = DesktopConversationSessionRuntime;

export function useConversationSessionProjection(transcriptSessionInfo) {
  const activeConversationRef = useChatStore((state) => state.activeConversationRef);
  const setActiveConversationRef = useChatStore((state) => state.setActiveConversationRef);

  useEffect(() => {
    applyChatConversationProjection({
      nextConversationRef: transcriptSessionInfo?.conversationRef,
      activeConversationRef,
      setChatConversationRef: setActiveConversationRef,
    });
  }, [activeConversationRef, setActiveConversationRef, transcriptSessionInfo?.conversationRef]);
}
