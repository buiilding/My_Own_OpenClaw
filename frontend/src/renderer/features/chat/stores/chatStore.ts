/**
 * Chat Store (Zustand).
 * Manages chat state: messages, sending status, thinking status, token counts.
 * Pure state management - no business logic.
 */

import { create } from 'zustand';
import type { ToolSchema } from '../../../types/backendEvents';
import type { CurrentTurnProjection } from '../../../infrastructure/api/windieSdkClient';
import {
  DEFAULT_CHAT_WORKSPACE_REF,
  createInitialStreamTracking,
  createInitialWorkspaceState,
  normalizeConversationRef,
  readWorkspaceState,
  resolveChatWorkspaceRef,
  resolveWorkspaceConversationRef,
  resolveWorkspaceKey,
} from './chatWorkspaceState';
import type { ChatWorkspaceState } from './chatWorkspaceState';

/**
 * Message type definition
 */
export interface ChatMessage {
  id: string;
  text: string;
  sender: 'user' | 'assistant';
  turnRef?: string;
  type?: 'llm-text' | 'tool-call' | 'tool-output' | 'tool-explanation' | 'tool-actions-summary' | 'search-source' | 'error';
  sourceEventType?: string | null;
  sourceChannel?: string | null;
  isComplete?: boolean;
  screenshot?: string | null;
  screenshotRef?: string | null;
  screenshotUrl?: string | null;
  screenshotContentType?: string | null;
  attachmentFilenames?: string[] | null;
  screenshots?: Array<{
    screenshot?: string | null;
    screenshotRef?: string | null;
    screenshotUrl?: string | null;
    screenshotContentType?: string | null;
  }> | null;
  modelId?: string | null;
  modelProvider?: string | null;
  toolMetadata?: Record<string, unknown> | null;
  toolName?: string;
  executionTime?: number | null;
  success?: boolean;
  correlationId?: string;
  timestamp?: string;
  modelFacingToolCall?: {
    id?: string;
    name?: string;
    arguments?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
    thought_signature?: string;
    raw_tool_call_preview?: string;
    raw_arguments_preview?: string;
    parse_error?: string;
    frontend_execution_skipped?: boolean;
  } | null;
  toolCallDisplayText?: string | null;
  modelFacingToolOutput?: string | null;
  toolCallDetails?: Record<string, unknown> | null;
  toolOutputDetails?: Record<string, unknown> | null;
  actionExplanations?: string[] | null;
  systemPrompt?: {
    content: string;
    toolSchemas?: ToolSchema[];
  };
  toolSchemas?: ToolSchema[];
  fullUserMessage?: {
    content: string;
    metadata?: Record<string, unknown>;
  };
  fullAssistantMessage?: {
    content: string;
  };
  feedback?: 'like' | 'dislike' | null;
  thinkingText?: string | null;
  thinkingSourceEventType?: string | null;
  tokenCounts?: TokenCounts | null;
}

/**
 * Token counts structure
 */
export interface TokenCounts {
  prompt_tokens?: number;
  visible_output_tokens?: number;
  thinking_tokens?: number | null;
  output_tokens_total?: number;
  total_tokens?: number;
  conversation_tokens?: number;
  usage_source?: 'provider' | 'estimated';
  cached_tokens?: number | null;
  cache_hit?: boolean | null;
  cache_status?: 'hit' | 'miss' | 'unknown' | null;
}

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

export type SdkCurrentTurnProjection = CurrentTurnProjection;

/**
 * Chat store state
 */
interface ChatState {
  activeConversationRef: string | null;
  workspaces: Record<string, ChatWorkspaceState>;
  turnConversationRefs: Record<string, string>;

  // State
  messages: ChatMessage[];
  isSending: boolean;
  thinkingStatus: string | null;
  thinkingSourceEventType: string | null;
  compactionDebugInfo: ChatWorkspaceState['compactionDebugInfo'];
  tokenCounts: TokenCounts | null;
  streamTracking: StreamTracking;
  currentTurnProjection: SdkCurrentTurnProjection | null;
  getWorkspaceState: (conversationRef?: string | null) => ChatWorkspaceState;
  setActiveConversationRef: (conversationRef: string | null) => void;
  registerTurnConversationRef: (turnRef: string, conversationRef: string | null | undefined) => void;
  resolveConversationRefForTurn: (turnRef: string | null | undefined) => string | null;

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
    currentTurnProjection: SdkCurrentTurnProjection | null,
    conversationRef?: string | null,
  ) => void;
  updateStreamTracking: (
    updater: (current: StreamTracking) => StreamTracking,
    conversationRef?: string | null,
  ) => void;
  clearMessages: (conversationRef?: string | null) => void;
}

type ProjectedWorkspaceFields = Pick<
ChatState,
'messages'
| 'isSending'
| 'thinkingStatus'
| 'thinkingSourceEventType'
| 'compactionDebugInfo'
| 'tokenCounts'
| 'streamTracking'
| 'currentTurnProjection'
>;

function getProjectedWorkspaceFields(workspace: ChatWorkspaceState): ProjectedWorkspaceFields {
  return {
    messages: workspace.messages,
    isSending: workspace.isSending,
    thinkingStatus: workspace.thinkingStatus,
    thinkingSourceEventType: workspace.thinkingSourceEventType,
    compactionDebugInfo: workspace.compactionDebugInfo,
    tokenCounts: workspace.tokenCounts,
    streamTracking: workspace.streamTracking,
    currentTurnProjection: workspace.currentTurnProjection,
  };
}

function isActiveWorkspaceRef(state: ChatState, workspaceRef: string): boolean {
  return workspaceRef === resolveChatWorkspaceRef(state.activeConversationRef);
}

function buildWorkspaceUpdate(
  state: ChatState,
  workspaceRef: string,
  workspace: ChatWorkspaceState,
  extraState: Partial<ChatState> = {},
): Partial<ChatState> {
  return {
    workspaces: {
      ...state.workspaces,
      [workspaceRef]: workspace,
    },
    ...extraState,
    ...(isActiveWorkspaceRef(state, workspaceRef) ? getProjectedWorkspaceFields(workspace) : {}),
  };
}

function resolveWorkspaceMutationTarget(
  state: ChatState,
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

/**
 * Chat store
 * Uses shallow equality for better performance with Zustand
 */
export const useChatStore = create<ChatState>((set, get) => ({
  // Initial state
  activeConversationRef: null,
  workspaces: {
    [DEFAULT_CHAT_WORKSPACE_REF]: createInitialWorkspaceState(),
  },
  turnConversationRefs: {},
  messages: [],
  isSending: false,
  thinkingStatus: null,
  thinkingSourceEventType: null,
  compactionDebugInfo: null,
  tokenCounts: null,
  streamTracking: createInitialStreamTracking(),
  currentTurnProjection: null,
  getWorkspaceState: (conversationRef) => {
    const state = get();
    const workspaceRef = resolveWorkspaceKey(conversationRef, state.activeConversationRef);
    return readWorkspaceState(state, workspaceRef);
  },

  setActiveConversationRef: (conversationRef) =>
    set((state) => {
      const normalizedConversationRef = normalizeConversationRef(conversationRef);
      const nextWorkspaceRef = resolveChatWorkspaceRef(normalizedConversationRef);
      const nextWorkspace = readWorkspaceState(state, nextWorkspaceRef);
      const hasWorkspace = Boolean(state.workspaces[nextWorkspaceRef]);
      if (
        state.activeConversationRef === normalizedConversationRef
        && hasWorkspace
        && state.messages === nextWorkspace.messages
        && state.isSending === nextWorkspace.isSending
        && state.thinkingStatus === nextWorkspace.thinkingStatus
        && state.thinkingSourceEventType === nextWorkspace.thinkingSourceEventType
        && state.compactionDebugInfo === nextWorkspace.compactionDebugInfo
        && state.tokenCounts === nextWorkspace.tokenCounts
        && state.streamTracking === nextWorkspace.streamTracking
        && state.currentTurnProjection === nextWorkspace.currentTurnProjection
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
        ...getProjectedWorkspaceFields(nextWorkspace),
      };
    }),

  registerTurnConversationRef: (turnRef, conversationRef) =>
    set((state) => {
      const normalizedTurnRef = typeof turnRef === 'string' ? turnRef.trim() : '';
      const normalizedConversationRef = normalizeConversationRef(conversationRef);
      if (!normalizedTurnRef || !normalizedConversationRef) {
        return state;
      }
      if (state.turnConversationRefs[normalizedTurnRef] === normalizedConversationRef) {
        return state;
      }
      return {
        turnConversationRefs: {
          ...state.turnConversationRefs,
          [normalizedTurnRef]: normalizedConversationRef,
        },
      };
    }),

  resolveConversationRefForTurn: (turnRef) => {
    const normalizedTurnRef = typeof turnRef === 'string' ? turnRef.trim() : '';
    if (!normalizedTurnRef) {
      return null;
    }
    return get().turnConversationRefs[normalizedTurnRef] || null;
  },

  // Actions
  addMessage: (message, conversationRef) =>
    set((state) => {
      const {
        normalizedConversationRef,
        workspaceRef,
        workspace: currentWorkspace,
      } = resolveWorkspaceMutationTarget(state, conversationRef);
      const nextWorkspace = {
        ...currentWorkspace,
        messages: [...currentWorkspace.messages, message],
      };
      const nextTurnConversationRefs = (
        message.turnRef && normalizedConversationRef
          ? {
            ...state.turnConversationRefs,
            [message.turnRef]: normalizedConversationRef,
          }
          : state.turnConversationRefs
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
      const nextTurnConversationRefs = (
        typeof updates.turnRef === 'string' && updates.turnRef.length > 0 && normalizedConversationRef
          ? {
            ...state.turnConversationRefs,
            [updates.turnRef]: normalizedConversationRef,
          }
          : state.turnConversationRefs
      );
      return buildWorkspaceUpdate(state, workspaceRef, nextWorkspace, {
        turnConversationRefs: nextTurnConversationRefs,
      });
    }),

  setMessages: (messages, conversationRef) =>
    set((state) => {
      const targetWorkspaceRef = resolveWorkspaceKey(conversationRef, state.activeConversationRef);
      const currentWorkspace = readWorkspaceState(state, targetWorkspaceRef);
      if (currentWorkspace.messages === messages) {
        return state;
      }
      const nextWorkspace = { ...currentWorkspace, messages };
      return buildWorkspaceUpdate(state, targetWorkspaceRef, nextWorkspace);
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
      if (currentWorkspace.currentTurnProjection === currentTurnProjection) {
        return state;
      }
      const nextWorkspace = { ...currentWorkspace, currentTurnProjection };
      return buildWorkspaceUpdate(state, targetWorkspaceRef, nextWorkspace);
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
        thinkingSourceEventType: null,
        compactionDebugInfo: null,
        streamTracking: createInitialStreamTracking(),
        currentTurnProjection: null,
      };
      return buildWorkspaceUpdate(state, targetWorkspaceRef, nextWorkspace);
    }),
}));
