/**
 * Owns renderer pending-turn state primitives for chat workspace reducers.
 */

import type {
  ChatMessage,
} from './desktopChatMessageTypes';
import type {
  NoViewSdkLiveTurnStorage,
} from './desktopChatWorkspaceStateRuntime';
import {
  DesktopChatWorkspaceStateRuntime,
} from './desktopChatWorkspaceStateRuntime';
import {
  DesktopPendingTurnBridgeRuntime,
} from './desktopPendingTurnBridgeRuntime';

type PendingTurnMatchInput = {
  conversationRef?: string | null;
  turnRef?: string | null;
} | null | undefined;

export type DesktopPendingTurnState = {
  conversationRef: string;
  turnRef: string;
  userMessageId: string;
  text: string;
  timestamp: string;
};

type PendingTurnWorkspaceState = NoViewSdkLiveTurnStorage & {
  messages: ChatMessage[];
  isSending: boolean;
  thinkingStatus: unknown;
  thinkingSourceEventType: string | null;
  conversationView: unknown;
  pendingTurn: DesktopPendingTurnState | null;
};

type PendingTurnWorkspaceMutationInput<TWorkspace extends PendingTurnWorkspaceState> = {
  currentWorkspace: TWorkspace;
  pendingTurn: unknown;
  preserveConversationView?: boolean;
  skipEchoedPendingTurn?: boolean;
};

type PendingTurnWorkspaceMutation<TWorkspace extends PendingTurnWorkspaceState> = {
  messages: ChatMessage[];
  normalizedPendingTurn: DesktopPendingTurnState;
  pendingMessage: ChatMessage;
  workspace: TWorkspace;
};

type PendingTurnClearWorkspaceMutationInput<TWorkspace extends PendingTurnWorkspaceState> = {
  currentWorkspace: TWorkspace;
  input?: PendingTurnMatchInput;
};

type PendingTurnStateStoreSnapshot = {
  activeConversationRef: string | null;
};

type PendingTurnStateStoreDependencies<
  TState extends PendingTurnStateStoreSnapshot,
  TWorkspace extends PendingTurnWorkspaceState,
> = {
  buildWorkspaceUpdate: (
    state: TState,
    workspaceRef: string,
    workspace: TWorkspace,
    extraState?: Partial<TState>,
  ) => Partial<TState> | TState;
  recordTurnConversationRefs: (
    messages: ChatMessage[],
    conversationRef: string | null,
  ) => void;
  readWorkspaceState: (state: TState, workspaceRef: string) => TWorkspace;
  resolveChatWorkspaceRef: (conversationRef: string | null | undefined) => string;
  resolveWorkspaceKey: (
    requestedConversationRef: string | null | undefined,
    activeConversationRef: string | null,
  ) => string;
};

type AcceptPendingTurnStateUpdateInput<
  TState extends PendingTurnStateStoreSnapshot,
  TWorkspace extends PendingTurnWorkspaceState,
> = {
  deps: PendingTurnStateStoreDependencies<TState, TWorkspace>;
  pendingTurn: unknown;
  state: TState;
};

type ClearPendingTurnStateUpdateInput<
  TState extends PendingTurnStateStoreSnapshot,
  TWorkspace extends PendingTurnWorkspaceState,
> = {
  deps: PendingTurnStateStoreDependencies<TState, TWorkspace>;
  input?: PendingTurnMatchInput;
  state: TState;
};

type PendingTurnBroadcastStateUpdateInput<
  TState extends PendingTurnStateStoreSnapshot,
  TWorkspace extends PendingTurnWorkspaceState,
> = {
  action: unknown;
  deps: PendingTurnStateStoreDependencies<TState, TWorkspace>;
  state: TState;
};

const {
  buildNoViewSdkLiveTurnStorageUpdate,
} = DesktopChatWorkspaceStateRuntime;
const {
  buildPendingTurnUserMessage,
} = DesktopPendingTurnBridgeRuntime;

function normalizeConversationRef(conversationRef?: string | null): string | null {
  if (typeof conversationRef !== 'string') {
    return null;
  }
  const normalizedConversationRef = conversationRef.trim();
  return normalizedConversationRef.length > 0 ? normalizedConversationRef : null;
}

function normalizeTurnRef(turnRef?: string | null): string | null {
  if (typeof turnRef !== 'string') {
    return null;
  }
  const normalizedTurnRef = turnRef.trim();
  return normalizedTurnRef.length > 0 ? normalizedTurnRef : null;
}

function normalizePendingTurn(value: unknown): DesktopPendingTurnState | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const source = value as Record<string, unknown>;
  const conversationRef = normalizeConversationRef(source.conversationRef as string | null | undefined);
  const turnRef = normalizeTurnRef(source.turnRef as string | null | undefined);
  const userMessageId = typeof source.userMessageId === 'string' && source.userMessageId.trim()
    ? source.userMessageId.trim()
    : null;
  const text = typeof source.text === 'string' ? source.text : null;
  const timestamp = typeof source.timestamp === 'string' && source.timestamp.trim()
    ? source.timestamp
    : null;
  if (!conversationRef || !turnRef || !userMessageId || text === null || !timestamp) {
    return null;
  }
  return {
    conversationRef,
    turnRef,
    userMessageId,
    text,
    timestamp,
  };
}

function doesPendingTurnMatch(
  pendingTurn: DesktopPendingTurnState | null,
  input?: PendingTurnMatchInput,
): boolean {
  if (!pendingTurn) {
    return false;
  }
  if (!input) {
    return true;
  }
  const conversationRef = normalizeConversationRef(input.conversationRef);
  const turnRef = normalizeTurnRef(input.turnRef);
  return (
    (!conversationRef || pendingTurn.conversationRef === conversationRef)
    && (!turnRef || pendingTurn.turnRef === turnRef)
  );
}

function isEchoedPendingTurn<TWorkspace extends PendingTurnWorkspaceState>(
  currentWorkspace: TWorkspace,
  pendingTurn: DesktopPendingTurnState,
): boolean {
  return Boolean(
    currentWorkspace.pendingTurn?.conversationRef === pendingTurn.conversationRef
    && currentWorkspace.pendingTurn?.turnRef === pendingTurn.turnRef
    && currentWorkspace.pendingTurn?.userMessageId === pendingTurn.userMessageId
    && currentWorkspace.pendingTurn?.text === pendingTurn.text,
  );
}

function buildPendingTurnWorkspaceMutation<TWorkspace extends PendingTurnWorkspaceState>({
  currentWorkspace,
  pendingTurn,
  preserveConversationView = false,
  skipEchoedPendingTurn = false,
}: PendingTurnWorkspaceMutationInput<TWorkspace>): PendingTurnWorkspaceMutation<TWorkspace> | null {
  const normalizedPendingTurn = normalizePendingTurn(pendingTurn);
  if (!normalizedPendingTurn) {
    return null;
  }
  if (skipEchoedPendingTurn && isEchoedPendingTurn(currentWorkspace, normalizedPendingTurn)) {
    return null;
  }
  const pendingMessage = buildPendingTurnUserMessage(normalizedPendingTurn) as ChatMessage | null;
  if (!pendingMessage) {
    return null;
  }
  const nextMessages = currentWorkspace.messages;
  const nextWorkspace = {
    ...buildNoViewSdkLiveTurnStorageUpdate(currentWorkspace, null),
    messages: nextMessages,
    isSending: true,
    thinkingStatus: null,
    thinkingSourceEventType: null,
    conversationView: preserveConversationView ? currentWorkspace.conversationView : null,
    pendingTurn: normalizedPendingTurn,
  } as TWorkspace;
  return {
    messages: nextMessages,
    normalizedPendingTurn,
    pendingMessage,
    workspace: nextWorkspace,
  };
}

function buildPendingTurnClearWorkspaceMutation<TWorkspace extends PendingTurnWorkspaceState>({
  currentWorkspace,
  input = null,
}: PendingTurnClearWorkspaceMutationInput<TWorkspace>): TWorkspace | null {
  if (!doesPendingTurnMatch(currentWorkspace.pendingTurn, input)) {
    return null;
  }
  return {
    ...currentWorkspace,
    pendingTurn: null,
    isSending: false,
  } as TWorkspace;
}

function buildAcceptPendingTurnStateUpdate<
  TState extends PendingTurnStateStoreSnapshot,
  TWorkspace extends PendingTurnWorkspaceState,
>({
  deps,
  pendingTurn,
  state,
}: AcceptPendingTurnStateUpdateInput<TState, TWorkspace>): Partial<TState> | TState | null {
  const normalizedPendingTurn = normalizePendingTurn(pendingTurn);
  if (!normalizedPendingTurn) {
    return null;
  }
  const workspaceRef = deps.resolveChatWorkspaceRef(normalizedPendingTurn.conversationRef);
  const currentWorkspace = deps.readWorkspaceState(state, workspaceRef);
  const pendingMutation = buildPendingTurnWorkspaceMutation({
    currentWorkspace,
    pendingTurn: normalizedPendingTurn,
    preserveConversationView: true,
    skipEchoedPendingTurn: true,
  });
  if (!pendingMutation) {
    return null;
  }
  deps.recordTurnConversationRefs(
    [pendingMutation.pendingMessage],
    pendingMutation.normalizedPendingTurn.conversationRef,
  );
  const extraState = {
    activeConversationRef: pendingMutation.normalizedPendingTurn.conversationRef,
  } as Partial<TState>;
  return deps.buildWorkspaceUpdate(state, workspaceRef, pendingMutation.workspace, extraState);
}

function buildClearPendingTurnStateUpdate<
  TState extends PendingTurnStateStoreSnapshot,
  TWorkspace extends PendingTurnWorkspaceState,
>({
  deps,
  input = null,
  state,
}: ClearPendingTurnStateUpdateInput<TState, TWorkspace>): Partial<TState> | TState | null {
  const conversationRef = normalizeConversationRef(input?.conversationRef);
  const workspaceRef = deps.resolveWorkspaceKey(conversationRef, state.activeConversationRef);
  const currentWorkspace = deps.readWorkspaceState(state, workspaceRef);
  const nextWorkspace = buildPendingTurnClearWorkspaceMutation({
    currentWorkspace,
    input,
  });
  if (!nextWorkspace) {
    return null;
  }
  return deps.buildWorkspaceUpdate(state, workspaceRef, nextWorkspace);
}

function isPendingTurnBroadcastAction(value: unknown): value is {
  conversationRef?: string | null;
  kind: 'clear' | 'pending';
  pendingTurn?: unknown;
  turnRef?: string | null;
} {
  return Boolean(
    value
      && typeof value === 'object'
      && !Array.isArray(value)
      && (
        (value as { kind?: unknown }).kind === 'clear'
        || (value as { kind?: unknown }).kind === 'pending'
      ),
  );
}

function buildPendingTurnBroadcastStateUpdate<
  TState extends PendingTurnStateStoreSnapshot,
  TWorkspace extends PendingTurnWorkspaceState,
>({
  action,
  deps,
  state,
}: PendingTurnBroadcastStateUpdateInput<TState, TWorkspace>): Partial<TState> | TState | null {
  if (!isPendingTurnBroadcastAction(action)) {
    return null;
  }
  if (action.kind === 'clear') {
    return buildClearPendingTurnStateUpdate({
      deps,
      input: {
        conversationRef: action.conversationRef,
        turnRef: action.turnRef,
      },
      state,
    });
  }
  return buildAcceptPendingTurnStateUpdate({
    deps,
    pendingTurn: action.pendingTurn,
    state,
  });
}

export const DesktopChatPendingTurnStateRuntime = Object.freeze({
  buildAcceptPendingTurnStateUpdate,
  buildClearPendingTurnStateUpdate,
  buildPendingTurnClearWorkspaceMutation,
  buildPendingTurnBroadcastStateUpdate,
  buildPendingTurnWorkspaceMutation,
  doesPendingTurnMatch,
  normalizePendingTurn,
});
