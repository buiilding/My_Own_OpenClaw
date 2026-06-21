/**
 * Orchestrates renderer new-chat session reset and local conversation creation.
 */

import { DesktopTranscriptSessionRuntimeClient } from './desktopTranscriptSessionRuntimeClient';
import { DesktopWorkspaceRuntimeClient } from './desktopWorkspaceRuntimeClient';
import {
  DesktopConversationSessionRuntime,
} from './desktopConversationSessionRuntime';
import { DesktopActiveChatSessionRuntime } from './desktopActiveChatSessionRuntime';
import type { TokenCounts } from './desktopChatMessageTypes';

const {
  resetActiveChatSession,
} = DesktopActiveChatSessionRuntime;
const {
  applyRendererConversationSelection,
  createConversationRef,
  initializeLocalConversationSession,
} = DesktopConversationSessionRuntime;

type NewChatSessionOptions = {
  clearMessages: (conversationRef?: string | null) => void;
  setThinkingStatus: (status: string | null, conversationRef?: string | null) => void;
  setTokenCounts: (counts: TokenCounts | null, conversationRef?: string | null) => void;
  setChatActiveConversationRef: (conversationRef: string | null) => void;
  workspace?: {
    activeWorkspaceName?: string | null;
    activeWorkspacePath?: string | null;
  } | null;
};

const startNewChatSession = ({
  clearMessages,
  setThinkingStatus,
  setTokenCounts,
  setChatActiveConversationRef,
  workspace,
}: NewChatSessionOptions): string => {
  resetActiveChatSession({
    clearMessages,
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

export const DesktopNewChatSessionRuntime = Object.freeze({
  startNewChatSession,
});
