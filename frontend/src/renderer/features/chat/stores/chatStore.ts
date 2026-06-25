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
  getProjectedWorkspaceFields,
  isActiveWorkspaceRef,
  normalizeConversationRef,
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
  DesktopChatSurfaceSelectorRuntime,
} from '../../../app/runtime/desktopChatSurfaceSelectorRuntime';
import {
  DesktopResponseOverlayViewRuntime,
} from '../../../app/runtime/desktopResponseOverlayViewRuntime';
import {
  DesktopChatPendingTurnStateRuntime,
} from '../../../app/runtime/desktopChatPendingTurnStateRuntime';
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
  buildStoppedTurnWorkspaceMutation,
} = DesktopStopTurnRuntime as {
  buildStoppedTurnWorkspaceMutation: (input: {
    conversationRef?: string | null;
    currentWorkspace: ChatWorkspaceState;
    stoppedAt?: string | null;
    turnRef?: string | null;
  }) => ChatWorkspaceState | null;
};
const {
  projectDesktopChatSurfaceState,
  projectDesktopChatInterfaceState,
  projectDesktopLiveTurnSurfaceState,
} = DesktopChatSurfaceSelectorRuntime;
const {
  buildResponseOverlayDismissalKey,
} = DesktopResponseOverlayViewRuntime;
const {
  buildAcceptPendingTurnStateUpdate,
  buildAcceptReplayPendingTurnStateUpdate,
  buildClearPendingTurnStateUpdate,
  buildPendingTurnBroadcastStateUpdate,
} = DesktopChatPendingTurnStateRuntime;
const {
  mergeTurnConversationRefs,
  normalizeTurnRef,
  registerTurnConversationRef,
  resolveConversationRefForTurn,
} = DesktopChatTurnConversationRefRuntime;
const {
  buildCurrentTurnWorkspaceMutation,
} = DesktopCurrentTurnWorkspaceRuntime;
const {
  buildConversationViewWorkspaceMutation,
} = DesktopConversationViewWorkspaceRuntime;
export type { ChatMessage, TokenCounts };

const pendingTurnStateRuntimeDependencies = {
  buildWorkspaceUpdate,
  getProjectedWorkspaceFields,
  mergeTurnConversationRefs,
  readWorkspaceState,
  resolveChatWorkspaceRef,
  resolveWorkspaceKey,
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

  // State
  messages: ChatMessage[];
  isSending: boolean;
  thinkingStatus: string | null;
  thinkingSourceEventType: string | null;
  compactionDebugInfo: ChatWorkspaceState['compactionDebugInfo'];
  tokenCounts: TokenCounts | null;
  streamTracking: StreamTracking;
  currentTurnProjection: CurrentTurnProjection | null;
  conversationView: ConversationView | null;
  pendingTurn: PendingTurn | null;
  supersededTurnRefs: Record<string, true>;
  latestConversationView: ConversationView | null;
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
  acceptReplayPendingTurn: (input: {
    conversationRef?: string | null;
    messages: ChatMessage[];
    pendingTurn: PendingTurn;
    supersededTurnRef?: string | null;
  }) => void;
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
  setLatestConversationView: (
    conversationView: ConversationView | null,
  ) => void;
  updateStreamTracking: (
    updater: (current: StreamTracking) => StreamTracking,
    conversationRef?: string | null,
  ) => void;
  clearMessages: (conversationRef?: string | null) => void;
}

export function selectChatInterfaceState(state: ChatState) {
  return projectDesktopChatInterfaceState(selectActiveWorkspaceState(state));
}

export function selectChatInterfaceSurfaceState(state: ChatState) {
  return projectDesktopChatSurfaceState({
    activeWorkspace: selectActiveWorkspaceState(state),
  });
}

export function selectLiveTurnSurfaceState(state: ChatState) {
  return projectDesktopLiveTurnSurfaceState({
    activeWorkspace: selectActiveWorkspaceState(state),
    latestConversationView: state.latestConversationView,
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
  latestConversationView: null,
  getWorkspaceState: (conversationRef) => {
    const state = get();
    const workspaceRef = resolveWorkspaceKey(conversationRef, state.activeConversationRef);
    return readWorkspaceState(state, workspaceRef);
  },

  setActiveConversationRef: (conversationRef) =>
    set((state) => buildActiveConversationWorkspaceUpdate(state, conversationRef)),

  registerTurnConversationRef: (turnRef, conversationRef) =>
    set((state) => {
      const nextTurnConversationRefs = registerTurnConversationRef(
        state.turnConversationRefs,
        turnRef,
        conversationRef,
      );
      if (nextTurnConversationRefs === state.turnConversationRefs) {
        return state;
      }
      return {
        turnConversationRefs: nextTurnConversationRefs,
      };
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
      const {
        normalizedConversationRef,
        workspaceRef,
        workspace: currentWorkspace,
      } = resolveWorkspaceMutationTarget(state, conversationRef);
      const existingMessageIndex = currentWorkspace.messages.findIndex(
        (existingMessage) => existingMessage.id === message.id,
      );
      const nextMessages = existingMessageIndex === -1
        ? [...currentWorkspace.messages, message]
        : currentWorkspace.messages.map((existingMessage, index) => (
          index === existingMessageIndex
            ? { ...existingMessage, ...message }
            : existingMessage
        ));
      const nextWorkspace = {
        ...currentWorkspace,
        messages: nextMessages,
      };
      const nextTurnConversationRefs = mergeTurnConversationRefs(
        state.turnConversationRefs,
        [message],
        normalizedConversationRef,
      );

      return buildWorkspaceUpdate(state, workspaceRef, nextWorkspace, {
        turnConversationRefs: nextTurnConversationRefs,
      });
    }),

  updateMessage: (id, updates, conversationRef) =>
    set((state) => {
      const {
        normalizedConversationRef,
        workspaceRef,
        workspace: currentWorkspace,
      } = resolveWorkspaceMutationTarget(state, conversationRef);
      const index = currentWorkspace.messages.findIndex((message) => message.id === id);
      if (index === -1) {
        return state;
      }

      const nextMessages = [...currentWorkspace.messages];
      nextMessages[index] = { ...nextMessages[index], ...updates };
      const nextWorkspace = { ...currentWorkspace, messages: nextMessages };
      const nextTurnConversationRefs = mergeTurnConversationRefs(
        state.turnConversationRefs,
        updates.turnRef !== undefined ? [nextMessages[index]] : [],
        normalizedConversationRef,
      );
      return buildWorkspaceUpdate(state, workspaceRef, nextWorkspace, {
        turnConversationRefs: nextTurnConversationRefs,
      });
    }),

  setMessages: (messages, conversationRef) =>
    set((state) => {
      const {
        normalizedConversationRef,
        workspaceRef,
        workspace: currentWorkspace,
      } = resolveWorkspaceMutationTarget(state, conversationRef);
      if (
        currentWorkspace.messages === messages
        || (
          currentWorkspace.messages.length === messages.length
          && currentWorkspace.messages.every((message, index) => message === messages[index])
        )
      ) {
        return state;
      }
      const nextWorkspace = { ...currentWorkspace, messages };
      const nextTurnConversationRefs = mergeTurnConversationRefs(
        state.turnConversationRefs,
        messages,
        normalizedConversationRef,
      );
      return buildWorkspaceUpdate(state, workspaceRef, nextWorkspace, {
        turnConversationRefs: nextTurnConversationRefs,
      });
    }),

  setIsSending: (isSending, conversationRef) =>
    set((state) => {
      const targetWorkspaceRef = resolveWorkspaceKey(conversationRef, state.activeConversationRef);
      const currentWorkspace = readWorkspaceState(state, targetWorkspaceRef);
      if (currentWorkspace.isSending === isSending) {
        return state;
      }
      const nextWorkspace = { ...currentWorkspace, isSending };
      return buildWorkspaceUpdate(state, targetWorkspaceRef, nextWorkspace);
    }),

  setThinkingStatus: (thinkingStatus, conversationRef) =>
    set((state) => {
      const targetWorkspaceRef = resolveWorkspaceKey(conversationRef, state.activeConversationRef);
      const currentWorkspace = readWorkspaceState(state, targetWorkspaceRef);
      if (currentWorkspace.thinkingStatus === thinkingStatus) {
        return state;
      }
      const nextWorkspace = { ...currentWorkspace, thinkingStatus };
      return buildWorkspaceUpdate(state, targetWorkspaceRef, nextWorkspace);
    }),

  setThinkingSourceEventType: (thinkingSourceEventType, conversationRef) =>
    set((state) => {
      const targetWorkspaceRef = resolveWorkspaceKey(conversationRef, state.activeConversationRef);
      const currentWorkspace = readWorkspaceState(state, targetWorkspaceRef);
      if (currentWorkspace.thinkingSourceEventType === thinkingSourceEventType) {
        return state;
      }
      const nextWorkspace = { ...currentWorkspace, thinkingSourceEventType };
      return buildWorkspaceUpdate(state, targetWorkspaceRef, nextWorkspace);
    }),

  setCompactionDebugInfo: (compactionDebugInfo, conversationRef) =>
    set((state) => {
      const targetWorkspaceRef = resolveWorkspaceKey(conversationRef, state.activeConversationRef);
      const currentWorkspace = readWorkspaceState(state, targetWorkspaceRef);
      if (currentWorkspace.compactionDebugInfo === compactionDebugInfo) {
        return state;
      }
      const nextWorkspace = { ...currentWorkspace, compactionDebugInfo };
      return buildWorkspaceUpdate(state, targetWorkspaceRef, nextWorkspace);
    }),

  setTokenCounts: (tokenCounts, conversationRef) =>
    set((state) => {
      const targetWorkspaceRef = resolveWorkspaceKey(conversationRef, state.activeConversationRef);
      const currentWorkspace = readWorkspaceState(state, targetWorkspaceRef);
      if (currentWorkspace.tokenCounts === tokenCounts) {
        return state;
      }
      const nextWorkspace = { ...currentWorkspace, tokenCounts };
      return buildWorkspaceUpdate(state, targetWorkspaceRef, nextWorkspace);
    }),

  setCurrentTurnProjection: (currentTurnProjection, conversationRef) =>
    set((state) => {
      const targetWorkspaceRef = resolveWorkspaceKey(conversationRef, state.activeConversationRef);
      const currentWorkspace = readWorkspaceState(state, targetWorkspaceRef);
      const nextWorkspace = buildCurrentTurnWorkspaceMutation({
        currentWorkspace,
        currentTurnProjection,
      });
      if (!nextWorkspace) {
        return state;
      }
      return buildWorkspaceUpdate(state, targetWorkspaceRef, nextWorkspace);
    }),

  setConversationView: (conversationView, conversationRef) =>
    set((state) => {
      const targetWorkspaceRef = resolveWorkspaceKey(
        conversationRef ?? conversationView?.conversationRef,
        state.activeConversationRef,
      );
      const currentWorkspace = readWorkspaceState(state, targetWorkspaceRef);
      const conversationViewMutation = buildConversationViewWorkspaceMutation({
        conversationView,
        currentWorkspace,
        isActiveWorkspace: isActiveWorkspaceRef(state, targetWorkspaceRef),
        latestConversationView: state.latestConversationView,
      });
      if (!conversationViewMutation) {
        return state;
      }
      const latestConversationViewUpdate = conversationViewMutation.hasLatestConversationViewUpdate
        ? { latestConversationView: conversationViewMutation.latestConversationView }
        : {};
      if (conversationViewMutation.workspace === currentWorkspace) {
        return latestConversationViewUpdate;
      }
      return buildWorkspaceUpdate(state, targetWorkspaceRef, conversationViewMutation.workspace, {
        ...latestConversationViewUpdate,
      });
    }),

  acceptReplayPendingTurn: ({ messages, pendingTurn, supersededTurnRef = null }) =>
    set((state) => {
      return buildAcceptReplayPendingTurnStateUpdate<ChatState, ChatWorkspaceState>({
        deps: pendingTurnStateRuntimeDependencies,
        messages,
        pendingTurn,
        state,
        supersededTurnRef,
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
      const conversationRef = normalizeConversationRef(input?.conversationRef);
      const turnRef = normalizeTurnRef(input?.turnRef);
      const workspaceRef = resolveWorkspaceKey(conversationRef, state.activeConversationRef);
      const currentWorkspace = readWorkspaceState(state, workspaceRef);
      const nextWorkspace = buildStoppedTurnWorkspaceMutation({
        conversationRef,
        currentWorkspace,
        stoppedAt: input?.stoppedAt,
        turnRef,
      });
      if (!nextWorkspace) {
        return state;
      }
      return buildWorkspaceUpdate(state, workspaceRef, nextWorkspace);
    }),

  applyPendingTurnBroadcast: (action) =>
    set((state) => {
      return buildPendingTurnBroadcastStateUpdate<ChatState, ChatWorkspaceState>({
        action,
        deps: pendingTurnStateRuntimeDependencies,
        state,
      }) ?? state;
    }),

  setLatestConversationView: (conversationView) =>
    set((state) => {
      if (state.latestConversationView === conversationView) {
        return state;
      }
      return {
        latestConversationView: conversationView,
      };
    }),

  updateStreamTracking: (updater, conversationRef) =>
    set((state) => {
      const targetWorkspaceRef = resolveWorkspaceKey(conversationRef, state.activeConversationRef);
      const currentWorkspace = readWorkspaceState(state, targetWorkspaceRef);
      const nextStreamTracking = updater(currentWorkspace.streamTracking);
      if (nextStreamTracking === currentWorkspace.streamTracking) {
        return state;
      }
      const nextWorkspace = {
        ...currentWorkspace,
        streamTracking: nextStreamTracking,
      };
      return buildWorkspaceUpdate(state, targetWorkspaceRef, nextWorkspace);
    }),

  clearMessages: (conversationRef) =>
    set((state) => {
      const targetWorkspaceRef = resolveWorkspaceKey(conversationRef, state.activeConversationRef);
      const currentWorkspace = readWorkspaceState(state, targetWorkspaceRef);
      const nextWorkspace: ChatWorkspaceState = {
        ...currentWorkspace,
        messages: [],
        isSending: false,
        thinkingSourceEventType: null,
        compactionDebugInfo: null,
        streamTracking: createInitialStreamTracking(),
        currentTurnProjection: null,
        conversationView: null,
        pendingTurn: null,
        supersededTurnRefs: {},
      };
      return buildWorkspaceUpdate(state, targetWorkspaceRef, nextWorkspace);
    }),
}));
