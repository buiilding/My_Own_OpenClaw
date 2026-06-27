/**
 * Chat store adapter functions for runtime-owned workspace mutations.
 */

import type {
  ConversationView,
  CurrentTurnProjection,
} from '../../../app/runtime/desktopConversationRuntimeContracts';
import type {
  ChatMessage,
  TokenCounts,
} from '../../../app/runtime/desktopChatMessageTypes';
import {
  buildWorkspaceUpdate,
  projectWorkspaceReadModelState,
  readWorkspaceState,
  resolveChatWorkspaceRef,
  resolveWorkspaceMutationTarget,
  resolveWorkspaceKey,
} from '../../../app/runtime/desktopChatWorkspaceStateRuntime';
import type {
  ChatWorkspaceReadModelState,
  ChatWorkspaceState,
} from '../../../app/runtime/desktopChatWorkspaceStateRuntime';
import {
  DesktopStopTurnRuntime,
} from '../../../app/runtime/desktopStopTurnRuntime';
import {
  DesktopChatPendingTurnStateRuntime,
} from '../../../app/runtime/desktopChatPendingTurnStateRuntime';
import type {
  DesktopPendingTurnState,
} from '../../../app/runtime/desktopChatPendingTurnStateRuntime';
import {
  DesktopChatClearMessagesRuntime,
} from '../../../app/runtime/desktopChatClearMessagesRuntime';
import {
  DesktopChatWorkspaceMessageRuntime,
} from '../../../app/runtime/desktopChatWorkspaceMessageRuntime';
import {
  DesktopChatStreamTrackingRuntime,
} from '../../../app/runtime/desktopChatStreamTrackingRuntime';
import type {
  StreamTracking,
} from '../../../app/runtime/desktopChatStreamTrackingRuntime';
import {
  DesktopChatWorkspaceFieldRuntime,
} from '../../../app/runtime/desktopChatWorkspaceFieldRuntime';
import {
  DesktopChatTurnConversationRefRuntime,
} from '../../../app/runtime/desktopChatTurnConversationRefRuntime';
import {
  DesktopChatProviderTraceRuntime,
} from '../../../app/runtime/desktopChatProviderTraceRuntime';
import {
  DesktopConversationDisplayProjection,
} from '../../../app/runtime/desktopConversationDisplayProjection';
import type {
  ChatStreamWorkspaceReadModel,
} from '../../../app/runtime/desktopChatStreamEventRuntime';
import {
  DesktopCurrentTurnWorkspaceRuntime,
} from '../../../app/runtime/desktopCurrentTurnWorkspaceRuntime';
import {
  DesktopConversationViewWorkspaceRuntime,
} from '../../../app/runtime/desktopConversationViewWorkspaceRuntime';
import type {
  CurrentTurnProjectionWorkspaceReadModel,
} from '../../../app/runtime/desktopConversationProjectionStreamRuntime';
import type { DesktopPendingTurnBroadcastAction } from '../../../app/runtime/desktopPendingTurnRuntimeClient';
import {
  selectChatSendReadModel,
  useChatStore,
} from './chatStore';
import type {
  ChatState,
} from './chatStore';

const {
  buildAcceptStoppedTurnStateUpdate,
} = DesktopStopTurnRuntime as {
  buildAcceptStoppedTurnStateUpdate: <TState extends Pick<ChatState, 'activeConversationRef'>, TWorkspace extends ChatWorkspaceState>(input: {
    deps: {
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
    input?: {
      conversationRef?: string | null;
      stoppedAt?: string | null;
      turnRef?: string | null;
    } | null;
    state: TState;
  }) => Partial<TState> | TState | null;
};
const {
  buildAcceptPendingTurnStateUpdate,
  buildClearPendingTurnStateUpdate,
  buildPendingTurnBroadcastStateUpdate,
} = DesktopChatPendingTurnStateRuntime;
const {
  buildClearMessagesStateUpdate,
} = DesktopChatClearMessagesRuntime;
const {
  buildAddMessageStateUpdate,
  buildSetMessagesStateUpdate,
  buildUpdateStreamTargetMessageStateUpdate,
  buildUpdateMessageStateUpdate,
} = DesktopChatWorkspaceMessageRuntime;
const {
  createInitialStreamTracking,
  buildUpdateStreamTrackingStateUpdate,
} = DesktopChatStreamTrackingRuntime;
const {
  buildSetWorkspaceFieldStateUpdate,
} = DesktopChatWorkspaceFieldRuntime;
const {
  recordRendererTurnConversationRefs,
} = DesktopChatTurnConversationRefRuntime;
const {
  buildChatProviderTraceWorkspaceSnapshot,
} = DesktopChatProviderTraceRuntime;
const {
  buildConversationViewTraceSummary,
} = DesktopConversationDisplayProjection;
const {
  buildSetNoViewSdkLiveTurnStateUpdate,
} = DesktopCurrentTurnWorkspaceRuntime;
const {
  buildSetConversationViewStateUpdate,
  hasWorkspaceConversationView,
  readConversationViewLiveTurnRef,
} = DesktopConversationViewWorkspaceRuntime;

const pendingTurnStateRuntimeDependencies = {
  buildWorkspaceUpdate,
  recordTurnConversationRefs: recordRendererTurnConversationRefs,
  readWorkspaceState,
  resolveChatWorkspaceRef,
  resolveWorkspaceKey,
};

const stopTurnStateRuntimeDependencies = {
  buildWorkspaceUpdate,
  readWorkspaceState,
  resolveWorkspaceKey,
};

const currentTurnStateRuntimeDependencies = {
  buildWorkspaceUpdate,
  readWorkspaceState,
  resolveWorkspaceKey,
};

const conversationViewStateRuntimeDependencies = {
  buildWorkspaceUpdate,
  readWorkspaceState,
  resolveWorkspaceKey,
};

const streamTrackingStateRuntimeDependencies = {
  buildWorkspaceUpdate,
  readWorkspaceState,
  resolveWorkspaceKey,
};

const workspaceFieldStateRuntimeDependencies = {
  buildWorkspaceUpdate,
  readWorkspaceState,
  resolveWorkspaceKey,
};

const clearMessagesStateRuntimeDependencies = {
  buildWorkspaceUpdate,
  createInitialStreamTracking,
  readWorkspaceState,
  resolveWorkspaceKey,
};

const workspaceMessageStateRuntimeDependencies = {
  buildWorkspaceUpdate,
  recordTurnConversationRefs: recordRendererTurnConversationRefs,
  resolveWorkspaceMutationTarget,
};

export function getActiveConversationRefFromChatStore(): string | null {
  return useChatStore.getState().activeConversationRef;
}

function readWorkspaceStateFromChatStore(
  conversationRef?: string | null,
): ChatWorkspaceState {
  const state = useChatStore.getState();
  const workspaceRef = resolveWorkspaceKey(conversationRef, state.activeConversationRef);
  return readWorkspaceState(state, workspaceRef);
}

function getProjectedWorkspaceReadModelFromChatStore(
  conversationRef?: string | null,
): ChatWorkspaceReadModelState {
  return projectWorkspaceReadModelState(
    readWorkspaceStateFromChatStore(conversationRef),
  );
}

function buildChatStreamWorkspaceReadModel(
  workspace: ChatWorkspaceReadModelState,
): ChatStreamWorkspaceReadModel {
  return {
    pendingTurn: workspace.pendingTurn
      ? {
        turnRef: workspace.pendingTurn.turnRef,
      }
      : null,
    streamTracking: workspace.streamTracking,
    thinkingSourceEventType: workspace.thinkingSourceEventType,
    viewLiveTurnRef: readConversationViewLiveTurnRef(workspace.conversationView),
  };
}

function buildCurrentTurnProjectionWorkspaceReadModel(
  workspace: ChatWorkspaceReadModelState,
): CurrentTurnProjectionWorkspaceReadModel {
  return {
    conversationView: workspace.conversationView,
    pendingTurn: workspace.pendingTurn
      ? {
        turnRef: workspace.pendingTurn.turnRef,
      }
      : null,
    sdkLiveTurn: workspace.sdkLiveTurn
      ? {
        phase: workspace.sdkLiveTurn.phase,
        turnRef: workspace.sdkLiveTurn.turnRef,
      }
      : null,
    streamTracking: workspace.streamTracking,
    thinkingStatus: workspace.thinkingStatus,
  };
}

function buildChatProviderTraceWorkspaceReadModel(
  workspace: ChatWorkspaceReadModelState,
) {
  const lastMessage = workspace.messages[workspace.messages.length - 1] ?? null;
  const hasConversationView = hasWorkspaceConversationView(workspace);
  return {
    conversationViewTraceSummary: hasConversationView
      ? buildConversationViewTraceSummary(workspace.conversationView)
      : null,
    messageCount: workspace.messages.length,
    activeTurnRef: workspace.streamTracking.activeTurnRef,
    lastMessage: lastMessage
      ? {
        sender: lastMessage.sender,
        type: lastMessage.type ?? null,
        textLength: typeof lastMessage.text === 'string' ? lastMessage.text.length : 0,
        turnRef: lastMessage.turnRef ?? null,
        sourceEventType: lastMessage.sourceEventType ?? null,
      }
      : null,
  };
}

export function getChatStreamWorkspaceReadModelFromChatStore(
  conversationRef?: string | null,
): ChatStreamWorkspaceReadModel {
  return buildChatStreamWorkspaceReadModel(
    getProjectedWorkspaceReadModelFromChatStore(conversationRef),
  );
}

export function getCurrentTurnProjectionWorkspaceReadModelFromChatStore(
  conversationRef?: string | null,
): CurrentTurnProjectionWorkspaceReadModel {
  return buildCurrentTurnProjectionWorkspaceReadModel(
    getProjectedWorkspaceReadModelFromChatStore(conversationRef),
  );
}

export function getChatSendReadModelFromChatStore(): ReturnType<typeof selectChatSendReadModel> {
  return selectChatSendReadModel(useChatStore.getState());
}

export function getChatProviderTraceWorkspaceSnapshotFromChatStore(
  conversationRef?: string | null,
): ReturnType<typeof buildChatProviderTraceWorkspaceSnapshot> {
  return buildChatProviderTraceWorkspaceSnapshot({
    activeConversationRef: getActiveConversationRefFromChatStore(),
    workspace: buildChatProviderTraceWorkspaceReadModel(
      getProjectedWorkspaceReadModelFromChatStore(conversationRef),
    ),
  });
}

export function applyPendingTurnBroadcastToChatStore(
  action: DesktopPendingTurnBroadcastAction,
): void {
  useChatStore.setState((state) => (
    buildPendingTurnBroadcastStateUpdate<ChatState, ChatWorkspaceState>({
      action,
      deps: pendingTurnStateRuntimeDependencies,
      state,
    }) ?? state
  ));
}

export function addMessageToChatStore(
  message: ChatMessage,
  conversationRef?: string | null,
): void {
  useChatStore.setState((state) => (
    buildAddMessageStateUpdate<ChatState, ChatWorkspaceState>({
      conversationRef,
      deps: workspaceMessageStateRuntimeDependencies,
      message,
      state,
    })
  ));
}

export function updateMessageInChatStore(
  id: string,
  updates: Partial<ChatMessage>,
  conversationRef?: string | null,
): void {
  useChatStore.setState((state) => (
    buildUpdateMessageStateUpdate<ChatState, ChatWorkspaceState>({
      conversationRef,
      deps: workspaceMessageStateRuntimeDependencies,
      id,
      state,
      updates,
    }) ?? state
  ));
}

export function updateStreamTargetMessageInChatStore(
  target: {
    kind: 'last_by_sender';
    sender: ChatMessage['sender'];
    turnRef?: string | null;
  } | {
    kind: 'last_assistant_llm_text';
    turnRef?: string | null;
  },
  updates: Partial<ChatMessage>,
  conversationRef?: string | null,
): void {
  useChatStore.setState((state) => (
    buildUpdateStreamTargetMessageStateUpdate<ChatState, ChatWorkspaceState>({
      conversationRef,
      deps: workspaceMessageStateRuntimeDependencies,
      state,
      target,
      updates,
    }) ?? state
  ));
}

export function setMessagesInChatStore(
  messages: ChatMessage[],
  conversationRef?: string | null,
): void {
  useChatStore.setState((state) => (
    buildSetMessagesStateUpdate<ChatState, ChatWorkspaceState>({
      conversationRef,
      deps: workspaceMessageStateRuntimeDependencies,
      messages,
      state,
    }) ?? state
  ));
}

export function clearMessagesInChatStore(
  conversationRef?: string | null,
  options: { preserveConversationView?: boolean } = {},
): void {
  useChatStore.setState((state) => (
    buildClearMessagesStateUpdate<ChatState, StreamTracking, ChatWorkspaceState>({
      conversationRef,
      deps: clearMessagesStateRuntimeDependencies,
      preserveConversationView: options.preserveConversationView === true,
      state,
    })
  ));
}

export function acceptPendingTurnInChatStore(
  pendingTurn: DesktopPendingTurnState,
): void {
  useChatStore.setState((state) => (
    buildAcceptPendingTurnStateUpdate<ChatState, ChatWorkspaceState>({
      deps: pendingTurnStateRuntimeDependencies,
      pendingTurn,
      state,
    }) ?? state
  ));
}

export function clearPendingTurnInChatStore(
  input: { conversationRef?: string | null; turnRef?: string | null } | null = null,
): void {
  useChatStore.setState((state) => (
    buildClearPendingTurnStateUpdate<ChatState, ChatWorkspaceState>({
      deps: pendingTurnStateRuntimeDependencies,
      input,
      state,
    }) ?? state
  ));
}

export function acceptStoppedTurnInChatStore(
  input: {
    conversationRef?: string | null;
    turnRef?: string | null;
    stoppedAt?: string | null;
  } | null = null,
): void {
  useChatStore.setState((state) => (
    buildAcceptStoppedTurnStateUpdate<ChatState, ChatWorkspaceState>({
      deps: stopTurnStateRuntimeDependencies,
      input,
      state,
    }) ?? state
  ));
}

export function setNoViewSdkLiveTurnInChatStore(
  sdkLiveTurn: CurrentTurnProjection | null,
  conversationRef?: string | null,
): void {
  useChatStore.setState((state) => (
    buildSetNoViewSdkLiveTurnStateUpdate<ChatState, ChatWorkspaceState>({
      conversationRef,
      deps: currentTurnStateRuntimeDependencies,
      sdkLiveTurn,
      state,
    }) ?? state
  ));
}

export function setConversationViewInChatStore(
  conversationView: ConversationView | null,
  conversationRef?: string | null,
): void {
  useChatStore.setState((state) => (
    buildSetConversationViewStateUpdate<ChatState, ChatWorkspaceState>({
      conversationView,
      conversationRef,
      deps: conversationViewStateRuntimeDependencies,
      state,
    }) ?? state
  ));
}

export function updateStreamTrackingInChatStore(
  updater: (current: StreamTracking) => StreamTracking,
  conversationRef?: string | null,
): void {
  useChatStore.setState((state) => (
    buildUpdateStreamTrackingStateUpdate<ChatState, ChatWorkspaceState>({
      conversationRef,
      deps: streamTrackingStateRuntimeDependencies,
      state,
      updater,
    }) ?? state
  ));
}

function setWorkspaceFieldInChatStore<Field extends keyof ChatWorkspaceState>(
  field: Field,
  value: ChatWorkspaceState[Field],
  conversationRef?: string | null,
): void {
  useChatStore.setState((state) => (
    buildSetWorkspaceFieldStateUpdate<ChatState, ChatWorkspaceState, Field>({
      conversationRef,
      deps: workspaceFieldStateRuntimeDependencies,
      field,
      state,
      value,
    }) ?? state
  ));
}

export function setIsSendingInChatStore(
  isSending: boolean,
  conversationRef?: string | null,
): void {
  setWorkspaceFieldInChatStore('isSending', isSending, conversationRef);
}

export function setThinkingStatusInChatStore(
  thinkingStatus: string | null,
  conversationRef?: string | null,
): void {
  setWorkspaceFieldInChatStore('thinkingStatus', thinkingStatus, conversationRef);
}

export function setThinkingSourceEventTypeInChatStore(
  thinkingSourceEventType: string | null,
  conversationRef?: string | null,
): void {
  setWorkspaceFieldInChatStore('thinkingSourceEventType', thinkingSourceEventType, conversationRef);
}

export function setCompactionDebugInfoInChatStore(
  compactionDebugInfo: ChatWorkspaceState['compactionDebugInfo'],
  conversationRef?: string | null,
): void {
  setWorkspaceFieldInChatStore('compactionDebugInfo', compactionDebugInfo, conversationRef);
}

export function setTokenCountsInChatStore(
  tokenCounts: TokenCounts | null,
  conversationRef?: string | null,
): void {
  setWorkspaceFieldInChatStore('tokenCounts', tokenCounts, conversationRef);
}
