/**
 * Coordinates the use conversation runtime projection stream for the renderer UI.
 */

import { useEffect, useRef } from 'react';
import {
  useChatStore,
} from '../stores/chatStore';
import {
  applyPendingTurnBroadcastToChatStore,
  setCurrentTurnProjectionInChatStore,
  setIsSendingInChatStore,
  setThinkingSourceEventTypeInChatStore,
  setThinkingStatusInChatStore,
  updateStreamTrackingInChatStore,
} from '../stores/chatStoreAdapters';
import { DesktopConversationRuntimeEventClient } from '../../../app/runtime/desktopConversationRuntimeEventClient';
import {
  DesktopConversationProjectionStreamRuntime,
} from '../../../app/runtime/desktopConversationProjectionStreamRuntime';

const {
  applyCurrentTurnProjectionEvent,
} = DesktopConversationProjectionStreamRuntime;

export function useConversationRuntimeProjectionStream(): void {
  const projectionCursorsRef = useRef(new Map());

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
          setIsSending: setIsSendingInChatStore,
          setThinkingStatus: setThinkingStatusInChatStore,
          setThinkingSourceEventType: setThinkingSourceEventTypeInChatStore,
          updateStreamTracking: updateStreamTrackingInChatStore,
        },
      });
    });
    return () => {
      removeListener?.();
    };
  }, []);
}
