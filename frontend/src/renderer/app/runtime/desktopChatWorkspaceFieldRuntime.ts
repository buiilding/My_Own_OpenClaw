/**
 * Owns simple chat workspace field state updates for renderer store bindings.
 */

type WorkspaceFieldStateSnapshot = {
  activeConversationRef: string | null;
};

type WorkspaceFieldStateDependencies<
  TState extends WorkspaceFieldStateSnapshot,
  TWorkspace extends object,
> = {
  buildWorkspaceUpdate: (
    state: TState,
    workspaceRef: string,
    workspace: TWorkspace,
  ) => Partial<TState> | TState;
  readWorkspaceState: (state: TState, workspaceRef: string) => TWorkspace;
  resolveWorkspaceKey: (
    requestedConversationRef: string | null | undefined,
    activeConversationRef: string | null,
  ) => string;
};

function buildSetWorkspaceFieldStateUpdate<
  TState extends WorkspaceFieldStateSnapshot,
  TWorkspace extends object,
  TField extends keyof TWorkspace,
>({
  conversationRef = null,
  deps,
  field,
  state,
  value,
}: {
  conversationRef?: string | null;
  deps: WorkspaceFieldStateDependencies<TState, TWorkspace>;
  field: TField;
  state: TState;
  value: TWorkspace[TField];
}): Partial<TState> | TState | null {
  const targetWorkspaceRef = deps.resolveWorkspaceKey(conversationRef, state.activeConversationRef);
  const currentWorkspace = deps.readWorkspaceState(state, targetWorkspaceRef);
  if (currentWorkspace[field] === value) {
    return null;
  }
  return deps.buildWorkspaceUpdate(state, targetWorkspaceRef, {
    ...currentWorkspace,
    [field]: value,
  } as TWorkspace);
}

export const DesktopChatWorkspaceFieldRuntime = Object.freeze({
  buildSetWorkspaceFieldStateUpdate,
});
