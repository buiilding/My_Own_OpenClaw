/**
 * Owns chat workspace clear/reset state updates for renderer store bindings.
 */

import type {
  NoViewSdkLiveTurnStorage,
} from './desktopChatWorkspaceStateRuntime';
import {
  DesktopChatWorkspaceStateRuntime,
} from './desktopChatWorkspaceStateRuntime';
import {
  DesktopConversationViewWorkspaceRuntime,
} from './desktopConversationViewWorkspaceRuntime';

type ClearMessagesStateSnapshot = {
  activeConversationRef: string | null;
};

type ClearMessagesWorkspace<TStreamTracking> = NoViewSdkLiveTurnStorage & {
  messages: unknown[];
  rendererAnnotations?: unknown[];
  isSending: boolean;
  thinkingSourceEventType: string | null;
  compactionDebugInfo: unknown;
  streamTracking: TStreamTracking;
  conversationView: unknown | null;
  pendingTurn: unknown | null;
};

type ClearMessagesStateDependencies<
  TState extends ClearMessagesStateSnapshot,
  TStreamTracking,
  TWorkspace extends ClearMessagesWorkspace<TStreamTracking>,
> = {
  buildWorkspaceUpdate: (
    state: TState,
    workspaceRef: string,
    workspace: TWorkspace,
  ) => Partial<TState> | TState;
  createInitialStreamTracking: () => TStreamTracking;
  readWorkspaceState: (state: TState, workspaceRef: string) => TWorkspace;
  resolveWorkspaceKey: (
    requestedConversationRef: string | null | undefined,
    activeConversationRef: string | null,
  ) => string;
};

const {
  buildNoViewSdkLiveTurnStorageUpdate,
} = DesktopChatWorkspaceStateRuntime;
const {
  hasWorkspaceConversationView,
} = DesktopConversationViewWorkspaceRuntime;

function buildClearMessagesStateUpdate<
  TState extends ClearMessagesStateSnapshot,
  TStreamTracking,
  TWorkspace extends ClearMessagesWorkspace<TStreamTracking>,
>({
  conversationRef = null,
  deps,
  preserveConversationView = false,
  state,
}: {
  conversationRef?: string | null;
  deps: ClearMessagesStateDependencies<TState, TStreamTracking, TWorkspace>;
  preserveConversationView?: boolean;
  state: TState;
}): Partial<TState> | TState {
  const targetWorkspaceRef = deps.resolveWorkspaceKey(conversationRef, state.activeConversationRef);
  const currentWorkspace = deps.readWorkspaceState(state, targetWorkspaceRef);
  const shouldPreserveConversationView = (
    preserveConversationView === true
    && hasWorkspaceConversationView(currentWorkspace)
  );
  return deps.buildWorkspaceUpdate(state, targetWorkspaceRef, {
    ...buildNoViewSdkLiveTurnStorageUpdate(currentWorkspace, null),
    messages: [],
    rendererAnnotations: shouldPreserveConversationView
      ? currentWorkspace.rendererAnnotations
      : [],
    isSending: false,
    thinkingSourceEventType: null,
    compactionDebugInfo: null,
    streamTracking: deps.createInitialStreamTracking(),
    conversationView: shouldPreserveConversationView
      ? currentWorkspace.conversationView
      : null,
    pendingTurn: null,
  });
}

export const DesktopChatClearMessagesRuntime = Object.freeze({
  buildClearMessagesStateUpdate,
});
