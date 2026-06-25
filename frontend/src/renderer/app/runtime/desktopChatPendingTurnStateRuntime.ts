/**
 * Owns renderer pending-turn state primitives for chat workspace reducers.
 */

import type {
  ChatMessage,
} from './desktopChatMessageTypes';
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
  attachmentFilenames: string[] | null;
};

type PendingTurnWorkspaceState = {
  messages: ChatMessage[];
  isSending: boolean;
  thinkingStatus: unknown;
  thinkingSourceEventType: string | null;
  currentTurnProjection: unknown;
  conversationView: unknown;
  pendingTurn: DesktopPendingTurnState | null;
  supersededTurnRefs: Record<string, true>;
};

type PendingTurnWorkspaceMutationInput<TWorkspace extends PendingTurnWorkspaceState> = {
  currentWorkspace: TWorkspace;
  pendingTurn: unknown;
  preserveConversationView?: boolean;
  replayMessages?: ChatMessage[] | null;
  skipEchoedPendingTurn?: boolean;
  supersededTurnRef?: string | null;
};

type PendingTurnWorkspaceMutation<TWorkspace extends PendingTurnWorkspaceState> = {
  messages: ChatMessage[];
  normalizedPendingTurn: DesktopPendingTurnState;
  optimisticMessage: ChatMessage;
  workspace: TWorkspace;
};

type PendingTurnClearWorkspaceMutationInput<TWorkspace extends PendingTurnWorkspaceState> = {
  currentWorkspace: TWorkspace;
  input?: PendingTurnMatchInput;
};

type PendingTurnStateStoreSnapshot = {
  activeConversationRef: string | null;
  turnConversationRefs: Record<string, string>;
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
  getProjectedWorkspaceFields: (workspace: TWorkspace) => Partial<TState>;
  mergeTurnConversationRefs: (
    current: Record<string, string>,
    messages: ChatMessage[],
    conversationRef: string | null,
  ) => Record<string, string>;
  readWorkspaceState: (state: TState, workspaceRef: string) => TWorkspace;
  resolveChatWorkspaceRef: (conversationRef: string | null | undefined) => string;
  resolveWorkspaceKey: (
    requestedConversationRef: string | null | undefined,
    activeConversationRef: string | null,
  ) => string;
};

type AcceptReplayPendingTurnStateUpdateInput<
  TState extends PendingTurnStateStoreSnapshot,
  TWorkspace extends PendingTurnWorkspaceState,
> = {
  deps: PendingTurnStateStoreDependencies<TState, TWorkspace>;
  messages: ChatMessage[];
  pendingTurn: unknown;
  state: TState;
  supersededTurnRef?: string | null;
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
  const attachmentFilenames = Array.isArray(source.attachmentFilenames)
    ? source.attachmentFilenames.filter((entry): entry is string => (
      typeof entry === 'string' && entry.trim().length > 0
    ))
    : null;
  return {
    conversationRef,
    turnRef,
    userMessageId,
    text,
    timestamp,
    attachmentFilenames: attachmentFilenames && attachmentFilenames.length > 0
      ? attachmentFilenames
      : null,
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

function addSupersededTurnRef(
  current: Record<string, true>,
  turnRef?: string | null,
): Record<string, true> {
  const normalizedTurnRef = normalizeTurnRef(turnRef);
  if (!normalizedTurnRef || current[normalizedTurnRef]) {
    return current;
  }
  return {
    ...current,
    [normalizedTurnRef]: true,
  };
}

function removeSupersededTurnRef(
  current: Record<string, true>,
  turnRef?: string | null,
): Record<string, true> {
  const normalizedTurnRef = normalizeTurnRef(turnRef);
  if (!normalizedTurnRef || !current[normalizedTurnRef]) {
    return current;
  }
  const { [normalizedTurnRef]: _removed, ...next } = current;
  return next;
}

function isEchoedPendingTurn<TWorkspace extends PendingTurnWorkspaceState>(
  currentWorkspace: TWorkspace,
  pendingTurn: DesktopPendingTurnState,
): boolean {
  const echoedPendingMessage = currentWorkspace.messages.find((message) => (
    message.id === pendingTurn.userMessageId
    && message.sender === 'user'
    && message.text === pendingTurn.text
    && message.turnRef === pendingTurn.turnRef
  ));
  return Boolean(
    echoedPendingMessage
    && currentWorkspace.pendingTurn?.conversationRef === pendingTurn.conversationRef
    && currentWorkspace.pendingTurn?.turnRef === pendingTurn.turnRef
    && currentWorkspace.pendingTurn?.userMessageId === pendingTurn.userMessageId
    && currentWorkspace.pendingTurn?.text === pendingTurn.text,
  );
}

function mergePendingTurnMessage(
  messages: ChatMessage[],
  optimisticMessage: ChatMessage,
): ChatMessage[] {
  const existingMessageIndex = messages.findIndex(
    (message) => message?.id === optimisticMessage.id,
  );
  return existingMessageIndex === -1
    ? [...messages, optimisticMessage]
    : messages.map((message, index) => (
      index === existingMessageIndex ? { ...message, ...optimisticMessage } : message
    ));
}

function buildPendingTurnWorkspaceMutation<TWorkspace extends PendingTurnWorkspaceState>({
  currentWorkspace,
  pendingTurn,
  preserveConversationView = false,
  replayMessages = null,
  skipEchoedPendingTurn = false,
  supersededTurnRef = null,
}: PendingTurnWorkspaceMutationInput<TWorkspace>): PendingTurnWorkspaceMutation<TWorkspace> | null {
  const normalizedPendingTurn = normalizePendingTurn(pendingTurn);
  if (!normalizedPendingTurn) {
    return null;
  }
  if (skipEchoedPendingTurn && isEchoedPendingTurn(currentWorkspace, normalizedPendingTurn)) {
    return null;
  }
  const optimisticMessage = buildPendingTurnUserMessage(normalizedPendingTurn) as ChatMessage | null;
  if (!optimisticMessage) {
    return null;
  }
  const sourceMessages = Array.isArray(replayMessages)
    ? replayMessages
    : currentWorkspace.messages;
  const nextMessages = mergePendingTurnMessage(sourceMessages, optimisticMessage);
  const nextWorkspace = {
    ...currentWorkspace,
    messages: nextMessages,
    isSending: true,
    thinkingStatus: null,
    thinkingSourceEventType: null,
    currentTurnProjection: null,
    conversationView: preserveConversationView ? currentWorkspace.conversationView : null,
    pendingTurn: normalizedPendingTurn,
    supersededTurnRefs: removeSupersededTurnRef(
      supersededTurnRef
        ? addSupersededTurnRef(currentWorkspace.supersededTurnRefs, supersededTurnRef)
        : currentWorkspace.supersededTurnRefs,
      normalizedPendingTurn.turnRef,
    ),
  } as TWorkspace;
  return {
    messages: nextMessages,
    normalizedPendingTurn,
    optimisticMessage,
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

function buildAcceptReplayPendingTurnStateUpdate<
  TState extends PendingTurnStateStoreSnapshot,
  TWorkspace extends PendingTurnWorkspaceState,
>({
  deps,
  messages,
  pendingTurn,
  state,
  supersededTurnRef = null,
}: AcceptReplayPendingTurnStateUpdateInput<TState, TWorkspace>): Partial<TState> | TState | null {
  const normalizedPendingTurn = normalizePendingTurn(pendingTurn);
  if (!normalizedPendingTurn) {
    return null;
  }
  const workspaceRef = deps.resolveChatWorkspaceRef(normalizedPendingTurn.conversationRef);
  const currentWorkspace = deps.readWorkspaceState(state, workspaceRef);
  const pendingMutation = buildPendingTurnWorkspaceMutation({
    currentWorkspace,
    pendingTurn: normalizedPendingTurn,
    replayMessages: Array.isArray(messages) ? messages : [],
    supersededTurnRef,
  });
  if (!pendingMutation) {
    return null;
  }
  const nextTurnConversationRefs = deps.mergeTurnConversationRefs(
    state.turnConversationRefs,
    pendingMutation.messages,
    pendingMutation.normalizedPendingTurn.conversationRef,
  );
  const extraState = {
    activeConversationRef: pendingMutation.normalizedPendingTurn.conversationRef,
    latestConversationView: null,
    turnConversationRefs: nextTurnConversationRefs,
    ...deps.getProjectedWorkspaceFields(pendingMutation.workspace),
  } as Partial<TState>;
  return deps.buildWorkspaceUpdate(state, workspaceRef, pendingMutation.workspace, extraState);
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
  const nextTurnConversationRefs = deps.mergeTurnConversationRefs(
    state.turnConversationRefs,
    [pendingMutation.optimisticMessage],
    pendingMutation.normalizedPendingTurn.conversationRef,
  );
  const extraState = {
    activeConversationRef: pendingMutation.normalizedPendingTurn.conversationRef,
    latestConversationView: pendingMutation.workspace.conversationView,
    turnConversationRefs: nextTurnConversationRefs,
    ...deps.getProjectedWorkspaceFields(pendingMutation.workspace),
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
  addSupersededTurnRef,
  buildAcceptPendingTurnStateUpdate,
  buildAcceptReplayPendingTurnStateUpdate,
  buildClearPendingTurnStateUpdate,
  buildPendingTurnClearWorkspaceMutation,
  buildPendingTurnBroadcastStateUpdate,
  buildPendingTurnWorkspaceMutation,
  doesPendingTurnMatch,
  normalizePendingTurn,
  removeSupersededTurnRef,
});
