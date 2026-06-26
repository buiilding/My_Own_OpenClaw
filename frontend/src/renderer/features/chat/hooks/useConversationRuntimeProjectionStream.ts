/**
 * Coordinates the use conversation runtime projection stream for the renderer UI.
 */

import { useEffect, useRef } from 'react';
import {
  useChatStore,
} from '../stores/chatStore';
import {
  projectWorkspaceReadModelState,
} from '../../../app/runtime/desktopChatWorkspaceStateRuntime';
import {
  applyPendingTurnBroadcastToChatStore,
  setIsSendingInChatStore,
  setSdkLiveTurnInChatStore,
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

function getChatWorkspaceReadModel(conversationRef?: string | null) {
  return projectWorkspaceReadModelState(
    useChatStore.getState().getWorkspaceState(conversationRef),
  );
}

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
          getWorkspaceState: getChatWorkspaceReadModel,
          setSdkLiveTurn: setSdkLiveTurnInChatStore,
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
