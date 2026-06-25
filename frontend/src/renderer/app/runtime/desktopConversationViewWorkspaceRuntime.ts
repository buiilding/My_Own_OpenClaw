import type { ConversationView } from './desktopConversationRuntimeContracts';

type ConversationViewWorkspace = {
  conversationView: ConversationView | null;
};

type ConversationViewWorkspaceMutation<TWorkspace extends ConversationViewWorkspace> = {
  workspace: TWorkspace;
  hasLatestConversationViewUpdate: boolean;
  latestConversationView: ConversationView | null;
};

function buildConversationViewWorkspaceMutation<TWorkspace extends ConversationViewWorkspace>({
  conversationView,
  currentWorkspace,
  isActiveWorkspace,
  latestConversationView,
}: {
  conversationView: ConversationView | null;
  currentWorkspace: TWorkspace;
  isActiveWorkspace: boolean;
  latestConversationView: ConversationView | null;
}): ConversationViewWorkspaceMutation<TWorkspace> | null {
  const hasWorkspaceUpdate = currentWorkspace.conversationView !== conversationView;
  const hasLatestConversationViewUpdate = (
    isActiveWorkspace
    && latestConversationView !== conversationView
  );

  if (!hasWorkspaceUpdate && !hasLatestConversationViewUpdate) {
    return null;
  }

  return {
    workspace: hasWorkspaceUpdate
      ? {
        ...currentWorkspace,
        conversationView,
      }
      : currentWorkspace,
    hasLatestConversationViewUpdate,
    latestConversationView: hasLatestConversationViewUpdate
      ? conversationView
      : latestConversationView,
  };
}

export const DesktopConversationViewWorkspaceRuntime = Object.freeze({
  buildConversationViewWorkspaceMutation,
});
