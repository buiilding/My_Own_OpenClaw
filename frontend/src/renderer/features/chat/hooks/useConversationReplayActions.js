/**
 * Provides the use conversation replay actions module for the renderer UI.
 */

import { useCallback } from 'react';
import {
  useChatStore,
} from '../stores/chatStore';
import {
  DesktopRendererConfigRuntimeClient,
} from '../../../app/runtime/desktopRendererConfigRuntimeClient';
import {
  DesktopConversationReplayRuntime,
} from '../../../app/runtime/desktopConversationReplayRuntime';

const {
  executeReplayAction,
} = DesktopConversationReplayRuntime;

export function useConversationReplayActions() {
  const { config } = DesktopRendererConfigRuntimeClient.useDesktopRendererConfigContext();
  const deferredQueryModelSelection = DesktopRendererConfigRuntimeClient
    .buildDeferredQueryModelSelection(config);

  const handleEditFromUser = useCallback(async (userMessageId, editedText) => {
    return executeReplayAction({
      action: 'edit_resend',
      deferredQueryModelSelection,
      userMessageId,
      editedText,
      chatStore: useChatStore,
    });
  }, [
    deferredQueryModelSelection,
  ]);

  const handleTryAgainFromAssistant = useCallback(async (assistantMessageId) => {
    return executeReplayAction({
      action: 'retry',
      deferredQueryModelSelection,
      assistantMessageId,
      chatStore: useChatStore,
    });
  }, [
    deferredQueryModelSelection,
  ]);

  return {
    handleEditFromUser,
    handleTryAgainFromAssistant,
  };
}
