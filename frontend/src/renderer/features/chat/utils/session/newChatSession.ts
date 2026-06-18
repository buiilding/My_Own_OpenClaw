/**
 * Provides the new chat session module for the renderer UI.
 */

import type { TokenCounts } from '../../stores/chatStore';
import { DesktopTranscriptSessionRuntimeClient } from '../../../../app/runtime/desktopTranscriptSessionRuntimeClient';
import { DesktopWorkspaceRuntimeClient } from '../../../../app/runtime/desktopWorkspaceRuntimeClient';
import {
  applyRendererConversationSelection,
  initializeLocalConversationSession,
} from '../../../../app/runtime/desktopConversationSessionRuntime';
import { createConversationRef } from './conversationRef';
import { resetActiveChatSession } from './resetActiveChatSession';

type NewChatSessionOptions = {
  clearMessages: (conversationRef?: string | null) => void;
  setIsSending: (isSending: boolean, conversationRef?: string | null) => void;
  setThinkingStatus: (status: string | null, conversationRef?: string | null) => void;
  setTokenCounts: (counts: TokenCounts | null, conversationRef?: string | null) => void;
  setChatActiveConversationRef: (conversationRef: string | null) => void;
  workspace?: {
    activeWorkspaceName?: string | null;
    activeWorkspacePath?: string | null;
  } | null;
};

export const startNewChatSession = ({
  clearMessages,
  setIsSending,
  setThinkingStatus,
  setTokenCounts,
  setChatActiveConversationRef,
  workspace,
}: NewChatSessionOptions): string => {
  resetActiveChatSession({
    clearMessages,
    setIsSending,
    setThinkingStatus,
    setTokenCounts,
  });
  setChatActiveConversationRef(null);

  return initializeLocalConversationSession({
    createConversationRef,
    selectConversationRef: (conversationRef) => {
      applyRendererConversationSelection({
        conversationRef,
        updateTranscriptSession: DesktopTranscriptSessionRuntimeClient.updateTranscriptSession,
        setChatConversationRef: setChatActiveConversationRef,
      });
    },
    onConversationCreated: (conversationRef) => {
      DesktopWorkspaceRuntimeClient.setConversationWorkspaceBinding(
        conversationRef,
        DesktopWorkspaceRuntimeClient.workspaceSelectionToBinding(workspace),
      );
    },
  });
};
