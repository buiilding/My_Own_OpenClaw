/**
 * Provides the chat workspace state module for the renderer UI.
 */

import type {
  ConversationView,
  CurrentTurnProjection,
} from './desktopConversationRuntimeContracts';
import type {
  CompactionDebugInfo,
} from './desktopChatStreamEventPayloadRuntime';
import type {
  DesktopPendingTurnState,
} from './desktopChatPendingTurnStateRuntime';
import type {
  StreamTracking,
} from './desktopChatStreamTrackingRuntime';
import {
  DesktopChatStreamTrackingRuntime,
} from './desktopChatStreamTrackingRuntime';
import type {
  ChatMessage,
  TokenCounts,
} from './desktopChatMessageTypes';
import {
  DesktopConversationDisplayProjection,
} from './desktopConversationDisplayProjection';

const {
  createInitialStreamTracking,
} = DesktopChatStreamTrackingRuntime;
const {
  selectRendererMessageAnnotations,
} = DesktopConversationDisplayProjection;

export interface ChatWorkspaceState {
  messages: ChatMessage[];
  isSending: boolean;
  thinkingStatus: string | null;
  thinkingSourceEventType: string | null;
  compactionDebugInfo: CompactionDebugInfo | null;
  tokenCounts: TokenCounts | null;
  streamTracking: StreamTracking;
  currentTurnProjection: CurrentTurnProjection | null;
  conversationView: ConversationView | null;
  pendingTurn: DesktopPendingTurnState | null;
}

interface ChatWorkspaceStoreSnapshot {
  activeConversationRef: string | null;
  workspaces?: Record<string, ChatWorkspaceState>;
}

export type ChatWorkspaceReadModelState = Omit<ChatWorkspaceState, 'currentTurnProjection'> & {
  rendererAnnotations?: unknown[];
  sdkLiveTurn?: CurrentTurnProjection | null;
};

const DEFAULT_CHAT_WORKSPACE_REF = '__default__';
const emptyChatMessages: ChatMessage[] = [];
const workspaceReadModelCache = new WeakMap<ChatWorkspaceState, ChatWorkspaceReadModelState>();

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
  };
}

export function createInitialWorkspaceRecord(): Record<string, ChatWorkspaceState> {
  return {
    [DEFAULT_CHAT_WORKSPACE_REF]: createInitialWorkspaceState(),
  };
}

export function readWorkspaceState(
  state: ChatWorkspaceStoreSnapshot,
  workspaceRef: string,
): ChatWorkspaceState {
  return state.workspaces?.[workspaceRef] ?? createInitialWorkspaceState();
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
  } as unknown as Partial<TState>;
}

export function selectActiveWorkspaceState(
  state: ChatWorkspaceStoreSnapshot,
): ChatWorkspaceState {
  const activeWorkspaceRef = resolveChatWorkspaceRef(state.activeConversationRef);
  return readWorkspaceState(state, activeWorkspaceRef);
}

export function projectWorkspaceReadModelState(
  workspace: ChatWorkspaceState,
): ChatWorkspaceReadModelState {
  const cachedReadModel = workspaceReadModelCache.get(workspace);
  if (cachedReadModel) {
    return cachedReadModel;
  }
  const hasConversationView = Boolean(workspace.conversationView);
  const {
    currentTurnProjection,
    ...workspaceWithoutNoViewSdkLiveTurn
  } = workspace;
  const readModelWorkspace = {
    ...workspaceWithoutNoViewSdkLiveTurn,
    messages: hasConversationView ? emptyChatMessages : workspace.messages,
    sdkLiveTurn: hasConversationView ? null : currentTurnProjection,
    rendererAnnotations: hasConversationView
      ? selectRendererMessageAnnotations(workspace.messages)
      : [],
  };
  workspaceReadModelCache.set(workspace, readModelWorkspace);
  return readModelWorkspace;
}

export function selectActiveWorkspaceReadModelState(
  state: ChatWorkspaceStoreSnapshot,
): ChatWorkspaceReadModelState {
  return projectWorkspaceReadModelState(selectActiveWorkspaceState(state));
}

export const DesktopChatWorkspaceStateRuntime = Object.freeze({
  buildActiveConversationWorkspaceUpdate,
  buildWorkspaceUpdate,
  createInitialWorkspaceRecord,
  createInitialWorkspaceState,
  isActiveWorkspaceRef,
  normalizeConversationRef,
  readWorkspaceState,
  resolveChatWorkspaceRef,
  resolveWorkspaceConversationRef,
  resolveWorkspaceKey,
  resolveWorkspaceMutationTarget,
  projectWorkspaceReadModelState,
  selectActiveWorkspaceReadModelState,
  selectActiveWorkspaceState,
});
