/**
 * Provides the chat workspace state module for the renderer UI.
 */

import type {
  ConversationView,
  CurrentTurnProjection,
} from '../../../app/runtime/desktopConversationRuntimeContracts';
import type {
  ChatMessage,
  PendingTurn,
  StreamTracking,
  TokenCounts,
} from './chatStore';

export interface ChatWorkspaceState {
  messages: ChatMessage[];
  isSending: boolean;
  thinkingStatus: string | null;
  thinkingSourceEventType: string | null;
  compactionDebugInfo: {
    reason: string | null;
    strategy: string | null;
    beforeTokens: number | null;
    afterTokens: number | null;
    removedMessages: number | null;
    summaryPreview: string | null;
    summaryText: string | null;
    replacementHistoryPreview: Array<{
      role: string | null;
      messageType: string | null;
      content: string | null;
      toolName: string | null;
      toolCallId: string | null;
    }>;
    skippedReason: string | null;
  } | null;
  tokenCounts: TokenCounts | null;
  streamTracking: StreamTracking;
  currentTurnProjection: CurrentTurnProjection | null;
  conversationView: ConversationView | null;
  pendingTurn: PendingTurn | null;
  supersededTurnRefs: Record<string, true>;
}

interface ChatWorkspaceStoreSnapshot {
  activeConversationRef: string | null;
  workspaces?: Record<string, ChatWorkspaceState>;
  latestConversationView?: ConversationView | null;
  messages?: ChatMessage[];
  isSending?: boolean;
  thinkingStatus?: string | null;
  thinkingSourceEventType?: string | null;
  compactionDebugInfo?: ChatWorkspaceState['compactionDebugInfo'];
  tokenCounts?: TokenCounts | null;
  streamTracking?: StreamTracking;
  currentTurnProjection?: CurrentTurnProjection | null;
  conversationView?: ConversationView | null;
  pendingTurn?: PendingTurn | null;
  supersededTurnRefs?: Record<string, true>;
}

const DEFAULT_CHAT_WORKSPACE_REF = '__default__';

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
    compactionDebugInfo: null,
    tokenCounts: null,
    streamTracking: createInitialStreamTracking(),
    currentTurnProjection: null,
    conversationView: null,
    pendingTurn: null,
    supersededTurnRefs: {},
  };
}

export function createInitialWorkspaceRecord(): Record<string, ChatWorkspaceState> {
  return {
    [DEFAULT_CHAT_WORKSPACE_REF]: createInitialWorkspaceState(),
  };
}

function buildActiveWorkspaceSnapshot(state: ChatWorkspaceStoreSnapshot): ChatWorkspaceState {
  return {
    messages: state.messages ?? [],
    isSending: state.isSending ?? false,
    thinkingStatus: state.thinkingStatus ?? null,
    thinkingSourceEventType: state.thinkingSourceEventType ?? null,
    compactionDebugInfo: state.compactionDebugInfo ?? null,
    tokenCounts: state.tokenCounts ?? null,
    streamTracking: state.streamTracking ?? createInitialStreamTracking(),
    currentTurnProjection: state.currentTurnProjection ?? null,
    conversationView: state.conversationView ?? null,
    pendingTurn: state.pendingTurn ?? null,
    supersededTurnRefs: state.supersededTurnRefs ?? {},
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
    && workspace.compactionDebugInfo === activeWorkspace.compactionDebugInfo
    && workspace.tokenCounts === activeWorkspace.tokenCounts
    && workspace.streamTracking === activeWorkspace.streamTracking
    && workspace.currentTurnProjection === activeWorkspace.currentTurnProjection
    && workspace.conversationView === activeWorkspace.conversationView
    && workspace.pendingTurn === activeWorkspace.pendingTurn
    && workspace.supersededTurnRefs === activeWorkspace.supersededTurnRefs
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

export type ProjectedWorkspaceFields = Pick<
ChatWorkspaceState,
'messages'
| 'isSending'
| 'thinkingStatus'
| 'thinkingSourceEventType'
| 'compactionDebugInfo'
| 'tokenCounts'
| 'streamTracking'
| 'currentTurnProjection'
| 'conversationView'
| 'pendingTurn'
| 'supersededTurnRefs'
>;

export function getProjectedWorkspaceFields(workspace: ChatWorkspaceState): ProjectedWorkspaceFields {
  return {
    messages: workspace.messages,
    isSending: workspace.isSending,
    thinkingStatus: workspace.thinkingStatus,
    thinkingSourceEventType: workspace.thinkingSourceEventType,
    compactionDebugInfo: workspace.compactionDebugInfo,
    tokenCounts: workspace.tokenCounts,
    streamTracking: workspace.streamTracking,
    currentTurnProjection: workspace.currentTurnProjection,
    conversationView: workspace.conversationView,
    pendingTurn: workspace.pendingTurn,
    supersededTurnRefs: workspace.supersededTurnRefs,
  };
}

export function isActiveWorkspaceRef(
  state: ChatWorkspaceStoreSnapshot,
  workspaceRef: string,
): boolean {
  return workspaceRef === resolveChatWorkspaceRef(state.activeConversationRef);
}

export function buildWorkspaceUpdate<TState extends ChatWorkspaceStoreSnapshot>(
  state: TState,
  workspaceRef: string,
  workspace: ChatWorkspaceState,
  extraState: Partial<TState> = {},
): Partial<TState> {
  return {
    workspaces: {
      ...state.workspaces,
      [workspaceRef]: workspace,
    },
    ...extraState,
    ...(isActiveWorkspaceRef(state, workspaceRef) ? getProjectedWorkspaceFields(workspace) : {}),
  } as Partial<TState>;
}

export function resolveWorkspaceMutationTarget<TState extends ChatWorkspaceStoreSnapshot>(
  state: TState,
  conversationRef?: string | null,
): {
  normalizedConversationRef: string | null;
  workspaceRef: string;
  workspace: ChatWorkspaceState;
} {
  const normalizedConversationRef = resolveWorkspaceConversationRef(
    conversationRef,
    state.activeConversationRef,
  );
  const workspaceRef = resolveChatWorkspaceRef(normalizedConversationRef);
  return {
    normalizedConversationRef,
    workspaceRef,
    workspace: readWorkspaceState(state, workspaceRef),
  };
}

export function buildActiveConversationWorkspaceUpdate<TState extends ChatWorkspaceStoreSnapshot>(
  state: TState,
  conversationRef: string | null,
): TState | Partial<TState> {
  const normalizedConversationRef = normalizeConversationRef(conversationRef);
  const nextWorkspaceRef = resolveChatWorkspaceRef(normalizedConversationRef);
  const nextWorkspace = readWorkspaceState(state, nextWorkspaceRef);
  const hasWorkspace = Boolean(state.workspaces?.[nextWorkspaceRef]);
  if (
    state.activeConversationRef === normalizedConversationRef
    && hasWorkspace
    && doesWorkspaceMatch(nextWorkspace, buildActiveWorkspaceSnapshot(state))
  ) {
    return state;
  }

  return {
    activeConversationRef: normalizedConversationRef,
    workspaces: hasWorkspace
      ? state.workspaces
      : {
        ...state.workspaces,
        [nextWorkspaceRef]: nextWorkspace,
      },
    latestConversationView: nextWorkspace.conversationView,
    ...getProjectedWorkspaceFields(nextWorkspace),
  } as Partial<TState>;
}

export function selectActiveWorkspaceState(
  state: ChatWorkspaceStoreSnapshot,
): ChatWorkspaceState {
  const activeWorkspaceRef = resolveChatWorkspaceRef(state.activeConversationRef);
  return readWorkspaceState(state, activeWorkspaceRef);
}
