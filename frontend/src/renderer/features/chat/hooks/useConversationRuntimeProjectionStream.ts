/**
 * Coordinates the use conversation runtime projection stream for the renderer UI.
 */

import { useEffect, useRef } from 'react';
import {
  applyPendingTurnBroadcastToChatStore,
  setCurrentTurnProjectionInChatStore,
  useChatStore,
} from '../stores/chatStore';
import { DesktopConversationRuntimeEventClient } from '../../../app/runtime/desktopConversationRuntimeEventClient';
import {
  DesktopConversationProjectionStreamRuntime,
} from '../../../app/runtime/desktopConversationProjectionStreamRuntime';

const {
  applyCurrentTurnProjectionEvent,
} = DesktopConversationProjectionStreamRuntime;

export function useConversationRuntimeProjectionStream(): void {
  const projectionCursorsRef = useRef(new Map());
  const setIsSending = useChatStore((state) => state.setIsSending);
  const setThinkingStatus = useChatStore((state) => state.setThinkingStatus);
  const setThinkingSourceEventType = useChatStore((state) => state.setThinkingSourceEventType);
  const updateStreamTracking = useChatStore((state) => state.updateStreamTracking);

  useEffect(() => {
    const removeListener = DesktopConversationRuntimeEventClient.onPendingTurn((action) => {
      applyPendingTurnBroadcastToChatStore(action);
    });
    return () => {
      removeListener?.();
    };
  }, []);

  useEffect(() => {
    const removeListener = DesktopConversationRuntimeEventClient.onCurrentTurnProjection((event) => {
      const { currentTurn, conversationRef } = event;
      if (!currentTurn || !conversationRef) {
        return;
      }
      applyCurrentTurnProjectionEvent({
        conversationRef,
        currentTurn,
        projectionCursors: projectionCursorsRef.current,
        deps: {
          getWorkspaceState: useChatStore.getState().getWorkspaceState,
          setCurrentTurnProjection: setCurrentTurnProjectionInChatStore,
          setIsSending,
          setThinkingStatus,
          setThinkingSourceEventType,
          updateStreamTracking,
        },
      });
    });
    return () => {
      removeListener?.();
    };
  }, [
    setIsSending,
    setThinkingSourceEventType,
    setThinkingStatus,
    updateStreamTracking,
  ]);
}
