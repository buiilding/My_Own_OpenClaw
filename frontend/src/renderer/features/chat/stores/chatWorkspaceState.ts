import type {
  ChatMessage,
  StreamTracking,
  TokenCounts,
} from './chatStore';

export interface ChatWorkspaceState {
  messages: ChatMessage[];
  isSending: boolean;
  thinkingStatus: string | null;
  thinkingSourceEventType: string | null;
  tokenCounts: TokenCounts | null;
  streamTracking: StreamTracking;
}

interface ChatWorkspaceStoreSnapshot {
  activeConversationRef: string | null;
  workspaces?: Record<string, ChatWorkspaceState>;
  messages?: ChatMessage[];
  isSending?: boolean;
  thinkingStatus?: string | null;
  thinkingSourceEventType?: string | null;
  tokenCounts?: TokenCounts | null;
  streamTracking?: StreamTracking;
}

export const DEFAULT_CHAT_WORKSPACE_REF = '__default__';

export function normalizeConversationRef(value: string | null | undefined): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

export function resolveChatWorkspaceRef(conversationRef: string | null | undefined): string {
  return normalizeConversationRef(conversationRef) || DEFAULT_CHAT_WORKSPACE_REF;
}

export function resolveWorkspaceConversationRef(
  requestedConversationRef: string | null | undefined,
  activeConversationRef: string | null,
): string | null {
  return normalizeConversationRef(requestedConversationRef ?? activeConversationRef);
}

export function resolveWorkspaceKey(
  requestedConversationRef: string | null | undefined,
  activeConversationRef: string | null,
): string {
  return resolveChatWorkspaceRef(
    resolveWorkspaceConversationRef(requestedConversationRef, activeConversationRef),
  );
}

export function createInitialStreamTracking(): StreamTracking {
  return {
    activeTurnRef: null,
    phase: 'idle',
    startedAt: null,
    firstChunkAt: null,
    completedAt: null,
    lastEventAt: null,
    lastEventType: null,
    eventCount: 0,
    chunkCount: 0,
    toolCallCount: 0,
    toolOutputCount: 0,
    lastChunkSize: 0,
    lastError: null,
  };
}

export function createInitialWorkspaceState(): ChatWorkspaceState {
  return {
    messages: [],
    isSending: false,
    thinkingStatus: null,
    thinkingSourceEventType: null,
    tokenCounts: null,
    streamTracking: createInitialStreamTracking(),
  };
}

function buildActiveWorkspaceSnapshot(state: ChatWorkspaceStoreSnapshot): ChatWorkspaceState {
  return {
    messages: state.messages ?? [],
    isSending: state.isSending ?? false,
    thinkingStatus: state.thinkingStatus ?? null,
    thinkingSourceEventType: state.thinkingSourceEventType ?? null,
    tokenCounts: state.tokenCounts ?? null,
    streamTracking: state.streamTracking ?? createInitialStreamTracking(),
  };
}

function doesWorkspaceMatch(
  workspace: ChatWorkspaceState,
  activeWorkspace: ChatWorkspaceState,
): boolean {
  return (
    workspace.messages === activeWorkspace.messages
    && workspace.isSending === activeWorkspace.isSending
    && workspace.thinkingStatus === activeWorkspace.thinkingStatus
    && workspace.thinkingSourceEventType === activeWorkspace.thinkingSourceEventType
    && workspace.tokenCounts === activeWorkspace.tokenCounts
    && workspace.streamTracking === activeWorkspace.streamTracking
  );
}

export function readWorkspaceState(
  state: ChatWorkspaceStoreSnapshot,
  workspaceRef: string,
): ChatWorkspaceState {
  const workspaces = state.workspaces ?? {};
  const workspace = workspaces[workspaceRef];
  const activeWorkspaceRef = resolveChatWorkspaceRef(state.activeConversationRef);
  const activeWorkspaceSnapshot = buildActiveWorkspaceSnapshot(state);

  if (workspace) {
    if (
      workspaceRef === activeWorkspaceRef
      && !doesWorkspaceMatch(workspace, activeWorkspaceSnapshot)
    ) {
      return activeWorkspaceSnapshot;
    }
    return workspace;
  }

  if (workspaceRef === activeWorkspaceRef) {
    return activeWorkspaceSnapshot;
  }

  return createInitialWorkspaceState();
}

export function selectActiveWorkspaceState(
  state: ChatWorkspaceStoreSnapshot,
): ChatWorkspaceState {
  const activeWorkspaceRef = resolveChatWorkspaceRef(state.activeConversationRef);
  return readWorkspaceState(state, activeWorkspaceRef);
}
