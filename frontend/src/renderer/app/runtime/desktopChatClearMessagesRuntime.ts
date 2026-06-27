/**
 * Owns chat workspace clear/reset state updates for renderer store bindings.
 */

import type {
  NoViewSdkLiveTurnStorage,
} from './desktopChatWorkspaceStateRuntime';
import {
  DesktopChatWorkspaceStateRuntime,
} from './desktopChatWorkspaceStateRuntime';

type ClearMessagesStateSnapshot = {
  activeConversationRef: string | null;
};

type ClearMessagesWorkspace<TStreamTracking> = NoViewSdkLiveTurnStorage & {
  messages: unknown[];
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

function buildClearMessagesStateUpdate<
  TState extends ClearMessagesStateSnapshot,
  TStreamTracking,
  TWorkspace extends ClearMessagesWorkspace<TStreamTracking>,
>({
  conversationRef = null,
  deps,
  state,
}: {
  conversationRef?: string | null;
  deps: ClearMessagesStateDependencies<TState, TStreamTracking, TWorkspace>;
  state: TState;
}): Partial<TState> | TState {
  const targetWorkspaceRef = deps.resolveWorkspaceKey(conversationRef, state.activeConversationRef);
  const currentWorkspace = deps.readWorkspaceState(state, targetWorkspaceRef);
  return deps.buildWorkspaceUpdate(state, targetWorkspaceRef, {
    ...buildNoViewSdkLiveTurnStorageUpdate(currentWorkspace, null),
    messages: [],
    isSending: false,
    thinkingSourceEventType: null,
    compactionDebugInfo: null,
    streamTracking: deps.createInitialStreamTracking(),
    conversationView: null,
    pendingTurn: null,
  });
}

export const DesktopChatClearMessagesRuntime = Object.freeze({
  buildClearMessagesStateUpdate,
});
