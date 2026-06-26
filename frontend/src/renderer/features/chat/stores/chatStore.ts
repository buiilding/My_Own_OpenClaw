/**
 * Chat Store (Zustand).
 * Manages chat state: messages, sending status, thinking status, token counts.
 * Pure state management - no business logic.
 */

import { create } from 'zustand';
import type {
  ConversationView,
  CurrentTurnProjection,
} from '../../../app/runtime/desktopConversationRuntimeContracts';
import type {
  ChatMessage,
  TokenCounts,
} from '../../../app/runtime/desktopChatMessageTypes';
import {
  buildActiveConversationWorkspaceUpdate,
  buildWorkspaceUpdate,
  createInitialStreamTracking,
  createInitialWorkspaceRecord,
  readWorkspaceState,
  resolveChatWorkspaceRef,
  resolveWorkspaceMutationTarget,
  resolveWorkspaceKey,
  selectActiveWorkspaceState,
} from './chatWorkspaceState';
import type { ChatWorkspaceState } from './chatWorkspaceState';
import {
  DesktopStopTurnRuntime,
} from '../../../app/runtime/desktopStopTurnRuntime';
import {
  DesktopChatInterfaceSelectorRuntime,
} from '../../../app/runtime/desktopChatInterfaceSelectorRuntime';
import {
  DesktopResponseOverlayViewRuntime,
} from '../../../app/runtime/desktopResponseOverlayViewRuntime';
import {
  DesktopChatPendingTurnStateRuntime,
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
import {
  DesktopChatWorkspaceFieldRuntime,
} from '../../../app/runtime/desktopChatWorkspaceFieldRuntime';
import {
  DesktopChatTurnConversationRefRuntime,
} from '../../../app/runtime/desktopChatTurnConversationRefRuntime';
import {
  DesktopCurrentTurnWorkspaceRuntime,
} from '../../../app/runtime/desktopCurrentTurnWorkspaceRuntime';
import {
  DesktopConversationViewWorkspaceRuntime,
} from '../../../app/runtime/desktopConversationViewWorkspaceRuntime';
import type { DesktopPendingTurnBroadcastAction } from '../../../app/runtime/desktopPendingTurnRuntimeClient';

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
  buildChatInterfaceSelectorState,
  buildChatInterfaceSurfaceSelectorState,
  buildChatSendReadModelSelectorState,
  buildLiveTurnSurfaceSelectorState,
} = DesktopChatInterfaceSelectorRuntime;
const {
  buildResponseOverlayDismissalKey,
} = DesktopResponseOverlayViewRuntime;
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
  buildUpdateStreamTrackingStateUpdate,
} = DesktopChatStreamTrackingRuntime;
const {
  buildSetWorkspaceFieldStateUpdate,
} = DesktopChatWorkspaceFieldRuntime;
const {
  buildRegisterTurnConversationRefStateUpdate,
  mergeTurnConversationRefs,
  resolveConversationRefForTurn,
} = DesktopChatTurnConversationRefRuntime;
const {
  buildSetCurrentTurnProjectionStateUpdate,
} = DesktopCurrentTurnWorkspaceRuntime;
const {
  buildSetConversationViewStateUpdate,
} = DesktopConversationViewWorkspaceRuntime;
export type { ChatMessage, TokenCounts };

const pendingTurnStateRuntimeDependencies = {
  buildWorkspaceUpdate,
  mergeTurnConversationRefs,
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
  mergeTurnConversationRefs,
  resolveWorkspaceMutationTarget,
};

export type StreamPhase =
  | 'idle'
  | 'awaiting-first-chunk'
  | 'streaming'
  | 'tool-call'
  | 'tool-output'
  | 'complete'
  | 'error';

export interface StreamTracking {
  activeTurnRef: string | null;
  phase: StreamPhase;
  startedAt: string | null;
  firstChunkAt: string | null;
  completedAt: string | null;
  lastEventAt: string | null;
  lastEventType: string | null;
  eventCount: number;
  chunkCount: number;
  toolCallCount: number;
  toolOutputCount: number;
  lastChunkSize: number;
  lastError: string | null;
}

export interface PendingTurn {
  conversationRef: string;
  turnRef: string;
  userMessageId: string;
  text: string;
  timestamp: string;
  attachmentFilenames: string[] | null;
}

interface ResponseOverlayDismissalInput {
  conversationRef?: string | null;
  turnRef?: string | null;
  responseEntryId?: string | null;
}

/**
 * Chat store state
 */
interface ChatState {
  activeConversationRef: string | null;
  workspaces: Record<string, ChatWorkspaceState>;
  turnConversationRefs: Record<string, string>;
  dismissedResponseOverlayEntries: Record<string, true>;

  getWorkspaceState: (conversationRef?: string | null) => ChatWorkspaceState;
  setActiveConversationRef: (conversationRef: string | null) => void;
  registerTurnConversationRef: (turnRef: string, conversationRef: string | null | undefined) => void;
  resolveConversationRefForTurn: (turnRef: string | null | undefined) => string | null;
  dismissResponseOverlayEntry: (input: ResponseOverlayDismissalInput) => void;
  isResponseOverlayEntryDismissed: (input: ResponseOverlayDismissalInput) => boolean;

  // Actions
  addMessage: (message: ChatMessage, conversationRef?: string | null) => void;
  updateMessage: (
    id: string,
    updates: Partial<ChatMessage>,
    conversationRef?: string | null,
  ) => void;
  updateStreamTargetMessage: (
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
  ) => void;
  setMessages: (messages: ChatMessage[], conversationRef?: string | null) => void;
  setIsSending: (isSending: boolean, conversationRef?: string | null) => void;
  setThinkingStatus: (status: string | null, conversationRef?: string | null) => void;
  setThinkingSourceEventType: (
    sourceEventType: string | null,
    conversationRef?: string | null,
  ) => void;
  setCompactionDebugInfo: (
    debugInfo: ChatWorkspaceState['compactionDebugInfo'],
    conversationRef?: string | null,
  ) => void;
  setTokenCounts: (counts: TokenCounts | null, conversationRef?: string | null) => void;
  setCurrentTurnProjection: (
    currentTurnProjection: CurrentTurnProjection | null,
    conversationRef?: string | null,
  ) => void;
  setConversationView: (
    conversationView: ConversationView | null,
    conversationRef?: string | null,
  ) => void;
  acceptPendingTurn: (pendingTurn: PendingTurn) => void;
  clearPendingTurn: (
    input?: { conversationRef?: string | null; turnRef?: string | null } | null,
  ) => void;
  acceptStoppedTurn: (
    input?: {
      conversationRef?: string | null;
      turnRef?: string | null;
      stoppedAt?: string | null;
    } | null,
  ) => void;
  applyPendingTurnBroadcast: (action: DesktopPendingTurnBroadcastAction) => void;
  updateStreamTracking: (
    updater: (current: StreamTracking) => StreamTracking,
    conversationRef?: string | null,
  ) => void;
  clearMessages: (conversationRef?: string | null) => void;
}

export function selectChatInterfaceState(state: ChatState) {
  return buildChatInterfaceSelectorState({
    activeConversationRef: state.activeConversationRef,
    activeWorkspace: selectActiveWorkspaceState(state),
  });
}

export function selectChatSendReadModel(state: ChatState) {
  return buildChatSendReadModelSelectorState({
    activeWorkspace: selectActiveWorkspaceState(state),
  });
}

export function selectChatInterfaceSurfaceState(state: ChatState) {
  return buildChatInterfaceSurfaceSelectorState({
    activeWorkspace: selectActiveWorkspaceState(state),
  });
}

export function selectLiveTurnSurfaceState(state: ChatState) {
  return buildLiveTurnSurfaceSelectorState({
    activeConversationRef: state.activeConversationRef,
    activeWorkspace: selectActiveWorkspaceState(state),
  });
}

/**
 * Chat store
 * Uses shallow equality for better performance with Zustand
 */
export const useChatStore = create<ChatState>((set, get) => ({
  // Initial state
  activeConversationRef: null,
  workspaces: createInitialWorkspaceRecord(),
  turnConversationRefs: {},
  dismissedResponseOverlayEntries: {},
  getWorkspaceState: (conversationRef) => {
    const state = get();
    const workspaceRef = resolveWorkspaceKey(conversationRef, state.activeConversationRef);
    return readWorkspaceState(state, workspaceRef);
  },

  setActiveConversationRef: (conversationRef) =>
    set((state) => buildActiveConversationWorkspaceUpdate(state, conversationRef)),

  registerTurnConversationRef: (turnRef, conversationRef) =>
    set((state) => {
      return buildRegisterTurnConversationRefStateUpdate<ChatState>({
        conversationRef,
        state,
        turnRef,
      }) ?? state;
    }),

  resolveConversationRefForTurn: (turnRef) => {
    return resolveConversationRefForTurn(get().turnConversationRefs, turnRef);
  },

  dismissResponseOverlayEntry: (input) =>
    set((state) => {
      const dismissalKey = buildResponseOverlayDismissalKey(input);
      if (!dismissalKey || state.dismissedResponseOverlayEntries[dismissalKey]) {
        return state;
      }
      return {
        dismissedResponseOverlayEntries: {
          ...state.dismissedResponseOverlayEntries,
          [dismissalKey]: true,
        },
      };
    }),

  isResponseOverlayEntryDismissed: (input) => {
    const dismissalKey = buildResponseOverlayDismissalKey(input);
    return Boolean(dismissalKey && get().dismissedResponseOverlayEntries[dismissalKey]);
  },

  // Actions
  addMessage: (message, conversationRef) =>
    set((state) => {
      return buildAddMessageStateUpdate<ChatState, ChatWorkspaceState>({
        conversationRef,
        deps: workspaceMessageStateRuntimeDependencies,
        message,
        state,
      });
    }),

  updateMessage: (id, updates, conversationRef) =>
    set((state) => {
      return buildUpdateMessageStateUpdate<ChatState, ChatWorkspaceState>({
        conversationRef,
        deps: workspaceMessageStateRuntimeDependencies,
        id,
        state,
        updates,
      }) ?? state;
    }),

  updateStreamTargetMessage: (target, updates, conversationRef) =>
    set((state) => {
      return buildUpdateStreamTargetMessageStateUpdate<ChatState, ChatWorkspaceState>({
        conversationRef,
        deps: workspaceMessageStateRuntimeDependencies,
        state,
        target,
        updates,
      }) ?? state;
    }),

  setMessages: (messages, conversationRef) =>
    set((state) => {
      return buildSetMessagesStateUpdate<ChatState, ChatWorkspaceState>({
        conversationRef,
        deps: workspaceMessageStateRuntimeDependencies,
        messages,
        state,
      }) ?? state;
    }),

  setIsSending: (isSending, conversationRef) =>
    set((state) => {
      return buildSetWorkspaceFieldStateUpdate<ChatState, ChatWorkspaceState, 'isSending'>({
        conversationRef,
        deps: workspaceFieldStateRuntimeDependencies,
        field: 'isSending',
        state,
        value: isSending,
      }) ?? state;
    }),

  setThinkingStatus: (thinkingStatus, conversationRef) =>
    set((state) => {
      return buildSetWorkspaceFieldStateUpdate<ChatState, ChatWorkspaceState, 'thinkingStatus'>({
        conversationRef,
        deps: workspaceFieldStateRuntimeDependencies,
        field: 'thinkingStatus',
        state,
        value: thinkingStatus,
      }) ?? state;
    }),

  setThinkingSourceEventType: (thinkingSourceEventType, conversationRef) =>
    set((state) => {
      return buildSetWorkspaceFieldStateUpdate<ChatState, ChatWorkspaceState, 'thinkingSourceEventType'>({
        conversationRef,
        deps: workspaceFieldStateRuntimeDependencies,
        field: 'thinkingSourceEventType',
        state,
        value: thinkingSourceEventType,
      }) ?? state;
    }),

  setCompactionDebugInfo: (compactionDebugInfo, conversationRef) =>
    set((state) => {
      return buildSetWorkspaceFieldStateUpdate<ChatState, ChatWorkspaceState, 'compactionDebugInfo'>({
        conversationRef,
        deps: workspaceFieldStateRuntimeDependencies,
        field: 'compactionDebugInfo',
        state,
        value: compactionDebugInfo,
      }) ?? state;
    }),

  setTokenCounts: (tokenCounts, conversationRef) =>
    set((state) => {
      return buildSetWorkspaceFieldStateUpdate<ChatState, ChatWorkspaceState, 'tokenCounts'>({
        conversationRef,
        deps: workspaceFieldStateRuntimeDependencies,
        field: 'tokenCounts',
        state,
        value: tokenCounts,
      }) ?? state;
    }),

  setCurrentTurnProjection: (currentTurnProjection, conversationRef) =>
    set((state) => {
      return buildSetCurrentTurnProjectionStateUpdate<ChatState, ChatWorkspaceState>({
        conversationRef,
        currentTurnProjection,
        deps: currentTurnStateRuntimeDependencies,
        state,
      }) ?? state;
    }),

  setConversationView: (conversationView, conversationRef) =>
    set((state) => {
      return buildSetConversationViewStateUpdate<ChatState, ChatWorkspaceState>({
        conversationView,
        conversationRef,
        deps: conversationViewStateRuntimeDependencies,
        state,
      }) ?? state;
    }),

  acceptPendingTurn: (pendingTurn) =>
    set((state) => {
      return buildAcceptPendingTurnStateUpdate<ChatState, ChatWorkspaceState>({
        deps: pendingTurnStateRuntimeDependencies,
        pendingTurn,
        state,
      }) ?? state;
    }),

  clearPendingTurn: (input = null) =>
    set((state) => {
      return buildClearPendingTurnStateUpdate<ChatState, ChatWorkspaceState>({
        deps: pendingTurnStateRuntimeDependencies,
        input,
        state,
      }) ?? state;
    }),

  acceptStoppedTurn: (input = null) =>
    set((state) => {
      return buildAcceptStoppedTurnStateUpdate<ChatState, ChatWorkspaceState>({
        deps: stopTurnStateRuntimeDependencies,
        input,
        state,
      }) ?? state;
    }),

  applyPendingTurnBroadcast: (action) =>
    set((state) => {
      return buildPendingTurnBroadcastStateUpdate<ChatState, ChatWorkspaceState>({
        action,
        deps: pendingTurnStateRuntimeDependencies,
        state,
      }) ?? state;
    }),

  updateStreamTracking: (updater, conversationRef) =>
    set((state) => {
      return buildUpdateStreamTrackingStateUpdate<ChatState, ChatWorkspaceState>({
        conversationRef,
        deps: streamTrackingStateRuntimeDependencies,
        state,
        updater,
      }) ?? state;
    }),

  clearMessages: (conversationRef) =>
    set((state) => {
      return buildClearMessagesStateUpdate<ChatState, StreamTracking, ChatWorkspaceState>({
        conversationRef,
        deps: clearMessagesStateRuntimeDependencies,
        state,
      });
    }),
}));
