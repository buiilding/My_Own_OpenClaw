/**
 * Chat Store (Zustand).
 * Manages chat state: messages, sending status, thinking status, token counts.
 * Pure state management - no business logic.
 */

import { create } from 'zustand';
import type { ToolSchema } from '../../../types/toolSchemas';
import type { CurrentTurnProjection } from '../../../app/runtime/desktopConversationRuntimeContracts';
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
import {
  buildStopQueryTrackingPatch,
  buildStoppedCurrentTurnProjection,
} from '../utils/state/stopQueryState';

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
    execution_skipped?: boolean;
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

export function buildResponseOverlayDismissalKey({
  conversationRef,
  turnRef,
  responseEntryId,
}: ResponseOverlayDismissalInput): string | null {
  if (typeof responseEntryId !== 'string' || !responseEntryId.trim()) {
    return null;
  }
  const normalizedConversationRef = normalizeConversationRef(conversationRef) || '';
  const normalizedTurnRef = normalizeTurnRef(turnRef) || '';
  return [
    normalizedConversationRef,
    normalizedTurnRef,
    responseEntryId.trim(),
  ].join('\u0001');
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
  currentTurnProjection: SdkCurrentTurnProjection | null;
  pendingTurn: PendingTurn | null;
  latestCurrentTurnProjection: SdkCurrentTurnProjection | null;
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
    currentTurnProjection: SdkCurrentTurnProjection | null,
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
      currentTurnProjection?: SdkCurrentTurnProjection | null;
      stoppedAt?: string | null;
    } | null,
  ) => void;
  applyPendingTurnBroadcast: (
    payload: unknown,
  ) => void;
  setLatestCurrentTurnProjection: (
    currentTurnProjection: SdkCurrentTurnProjection | null,
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
| 'pendingTurn'
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
    pendingTurn: workspace.pendingTurn,
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

function normalizeTurnRef(turnRef?: string | null): string | null {
  if (typeof turnRef !== 'string') {
    return null;
  }
  const normalizedTurnRef = turnRef.trim();
  return normalizedTurnRef.length > 0 ? normalizedTurnRef : null;
}

function mergeTurnConversationRefs(
  currentTurnConversationRefs: Record<string, string>,
  messages: ChatMessage[],
  conversationRef: string | null,
): Record<string, string> {
  if (!conversationRef) {
    return currentTurnConversationRefs;
  }

  let nextTurnConversationRefs = currentTurnConversationRefs;
  for (const message of messages) {
    const turnRef = normalizeTurnRef(message.turnRef);
    if (!turnRef || nextTurnConversationRefs[turnRef] === conversationRef) {
      continue;
    }
    if (nextTurnConversationRefs === currentTurnConversationRefs) {
      nextTurnConversationRefs = { ...currentTurnConversationRefs };
    }
    nextTurnConversationRefs[turnRef] = conversationRef;
  }
  return nextTurnConversationRefs;
}

function buildPendingTurnUserMessage(pendingTurn: PendingTurn): ChatMessage {
  return {
    id: pendingTurn.userMessageId,
    text: pendingTurn.text,
    sender: 'user',
    turnRef: pendingTurn.turnRef,
    sourceEventType: 'renderer-compose',
    sourceChannel: 'renderer-local',
    isComplete: true,
    timestamp: pendingTurn.timestamp,
    attachmentFilenames: pendingTurn.attachmentFilenames,
  };
}

function doesPendingTurnMatch(
  pendingTurn: PendingTurn | null,
  input?: { conversationRef?: string | null; turnRef?: string | null } | null,
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

function normalizePendingTurn(value: unknown): PendingTurn | null {
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

function shouldCurrentTurnClearPendingTurn(
  pendingTurn: PendingTurn | null,
  currentTurnProjection: SdkCurrentTurnProjection | null,
): boolean {
  if (!pendingTurn || !currentTurnProjection) {
    return false;
  }
  if (
    normalizeConversationRef(currentTurnProjection.conversationRef) !== pendingTurn.conversationRef
    || normalizeTurnRef(currentTurnProjection.turnRef) !== pendingTurn.turnRef
  ) {
    return false;
  }
  const presentation = currentTurnProjection.presentation;
  const entries = Array.isArray(presentation?.entries) ? presentation.entries : [];
  return (
    currentTurnProjection.phase === 'streaming'
    || currentTurnProjection.phase === 'tool_call'
    || currentTurnProjection.phase === 'tool_output'
    || currentTurnProjection.phase === 'complete'
    || currentTurnProjection.phase === 'error'
    || presentation?.typingVisible === true
    || presentation?.hasVisibleContent === true
    || entries.length > 0
  );
}

function doesCurrentTurnProjectionMatch(
  currentTurnProjection: SdkCurrentTurnProjection | null,
  input?: { conversationRef?: string | null; turnRef?: string | null } | null,
): boolean {
  if (!currentTurnProjection || !input) {
    return false;
  }
  const conversationRef = normalizeConversationRef(input.conversationRef);
  const turnRef = normalizeTurnRef(input.turnRef);
  const projectionConversationRef = normalizeConversationRef(currentTurnProjection.conversationRef);
  const projectionTurnRef = normalizeTurnRef(currentTurnProjection.turnRef);
  return (
    (!conversationRef || projectionConversationRef === conversationRef)
    && (!turnRef || projectionTurnRef === turnRef)
  );
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
  dismissedResponseOverlayEntries: {},
  messages: [],
  isSending: false,
  thinkingStatus: null,
  thinkingSourceEventType: null,
  compactionDebugInfo: null,
  tokenCounts: null,
  streamTracking: createInitialStreamTracking(),
  currentTurnProjection: null,
  pendingTurn: null,
  latestCurrentTurnProjection: null,
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
        && state.pendingTurn === nextWorkspace.pendingTurn
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
      const normalizedTurnRef = normalizeTurnRef(turnRef);
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
    const normalizedTurnRef = normalizeTurnRef(turnRef);
    if (!normalizedTurnRef) {
      return null;
    }
    return get().turnConversationRefs[normalizedTurnRef] || null;
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
      if (currentWorkspace.messages === messages) {
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
      const nextPendingTurn = shouldCurrentTurnClearPendingTurn(
        currentWorkspace.pendingTurn,
        currentTurnProjection,
      )
        ? null
        : currentWorkspace.pendingTurn;
      const latestUpdate = state.latestCurrentTurnProjection === currentTurnProjection
        ? {}
        : { latestCurrentTurnProjection: currentTurnProjection };
      if (
        currentWorkspace.currentTurnProjection === currentTurnProjection
        && currentWorkspace.pendingTurn === nextPendingTurn
      ) {
        return Object.keys(latestUpdate).length > 0 ? latestUpdate : state;
      }
      const nextWorkspace = {
        ...currentWorkspace,
        currentTurnProjection,
        pendingTurn: nextPendingTurn,
      };
      return buildWorkspaceUpdate(state, targetWorkspaceRef, nextWorkspace, latestUpdate);
    }),

  acceptPendingTurn: (pendingTurn) =>
    set((state) => {
      const normalizedConversationRef = normalizeConversationRef(pendingTurn.conversationRef);
      const normalizedTurnRef = normalizeTurnRef(pendingTurn.turnRef);
      const normalizedPendingTurn = normalizePendingTurn(pendingTurn);
      if (!normalizedConversationRef || !normalizedTurnRef || !normalizedPendingTurn) {
        return state;
      }
      const workspaceRef = resolveChatWorkspaceRef(normalizedConversationRef);
      const currentWorkspace = readWorkspaceState(state, workspaceRef);
      const optimisticMessage = buildPendingTurnUserMessage(normalizedPendingTurn);
      const existingMessageIndex = currentWorkspace.messages.findIndex(
        (message) => message.id === optimisticMessage.id,
      );
      const nextMessages = existingMessageIndex === -1
        ? [...currentWorkspace.messages, optimisticMessage]
        : currentWorkspace.messages.map((message, index) => (
          index === existingMessageIndex ? { ...message, ...optimisticMessage } : message
        ));
      const nextWorkspace = {
        ...currentWorkspace,
        messages: nextMessages,
        isSending: true,
        thinkingStatus: null,
        thinkingSourceEventType: null,
        currentTurnProjection: null,
        pendingTurn: normalizedPendingTurn,
      };
      const nextTurnConversationRefs = mergeTurnConversationRefs(
        state.turnConversationRefs,
        [optimisticMessage],
        normalizedConversationRef,
      );
      return buildWorkspaceUpdate(state, workspaceRef, nextWorkspace, {
        activeConversationRef: normalizedConversationRef,
        latestCurrentTurnProjection: null,
        turnConversationRefs: nextTurnConversationRefs,
        ...getProjectedWorkspaceFields(nextWorkspace),
      });
    }),

  clearPendingTurn: (input = null) =>
    set((state) => {
      const conversationRef = normalizeConversationRef(input?.conversationRef);
      const workspaceRef = resolveWorkspaceKey(conversationRef, state.activeConversationRef);
      const currentWorkspace = readWorkspaceState(state, workspaceRef);
      if (!doesPendingTurnMatch(currentWorkspace.pendingTurn, input)) {
        return state;
      }
      const nextWorkspace = {
        ...currentWorkspace,
        pendingTurn: null,
        isSending: false,
      };
      return buildWorkspaceUpdate(state, workspaceRef, nextWorkspace);
    }),

  acceptStoppedTurn: (input = null) =>
    set((state) => {
      const inputProjection = input?.currentTurnProjection ?? null;
      const conversationRef = (
        normalizeConversationRef(input?.conversationRef)
        || normalizeConversationRef(inputProjection?.conversationRef)
      );
      const turnRef = (
        normalizeTurnRef(input?.turnRef)
        || normalizeTurnRef(inputProjection?.turnRef)
      );
      const workspaceRef = resolveWorkspaceKey(conversationRef, state.activeConversationRef);
      const currentWorkspace = readWorkspaceState(state, workspaceRef);
      const stoppedAt = typeof input?.stoppedAt === 'string' && input.stoppedAt.trim()
        ? input.stoppedAt
        : new Date().toISOString();
      const target = { conversationRef, turnRef };
      const workspaceProjection = currentWorkspace.currentTurnProjection;
      const projectionToStop = doesCurrentTurnProjectionMatch(workspaceProjection, target)
        ? workspaceProjection
        : inputProjection;
      const nextCurrentTurnProjection = projectionToStop
        ? buildStoppedCurrentTurnProjection(projectionToStop)
        : workspaceProjection;
      const nextPendingTurn = doesPendingTurnMatch(currentWorkspace.pendingTurn, target)
        ? null
        : currentWorkspace.pendingTurn;
      const nextStreamTracking: StreamTracking = {
        ...currentWorkspace.streamTracking,
        ...buildStopQueryTrackingPatch(stoppedAt),
        phase: 'complete',
      };
      const nextWorkspace = {
        ...currentWorkspace,
        isSending: false,
        thinkingStatus: null,
        thinkingSourceEventType: null,
        pendingTurn: nextPendingTurn,
        currentTurnProjection: nextCurrentTurnProjection,
        streamTracking: nextStreamTracking,
      };
      const latestProjection = doesCurrentTurnProjectionMatch(state.latestCurrentTurnProjection, target)
        ? buildStoppedCurrentTurnProjection(state.latestCurrentTurnProjection)
        : state.latestCurrentTurnProjection;
      return buildWorkspaceUpdate(state, workspaceRef, nextWorkspace, {
        latestCurrentTurnProjection: latestProjection,
      });
    }),

  applyPendingTurnBroadcast: (payload) =>
    set((state) => {
      const source = payload && typeof payload === 'object' && !Array.isArray(payload)
        ? payload as Record<string, unknown>
        : {};
      if (source.type === 'clear') {
        const conversationRef = normalizeConversationRef(source.conversationRef as string | null | undefined);
        const turnRef = normalizeTurnRef(source.turnRef as string | null | undefined);
        const workspaceRef = resolveWorkspaceKey(conversationRef, state.activeConversationRef);
        const currentWorkspace = readWorkspaceState(state, workspaceRef);
        if (!doesPendingTurnMatch(currentWorkspace.pendingTurn, { conversationRef, turnRef })) {
          return state;
        }
        const nextWorkspace = {
          ...currentWorkspace,
          pendingTurn: null,
          isSending: false,
        };
        return buildWorkspaceUpdate(state, workspaceRef, nextWorkspace);
      }
      const normalizedPendingTurn = normalizePendingTurn(source.pendingTurn);
      if (!normalizedPendingTurn) {
        return state;
      }
      const workspaceRef = resolveChatWorkspaceRef(normalizedPendingTurn.conversationRef);
      const currentWorkspace = readWorkspaceState(state, workspaceRef);
      const optimisticMessage = buildPendingTurnUserMessage(normalizedPendingTurn);
      const existingMessageIndex = currentWorkspace.messages.findIndex(
        (message) => message.id === optimisticMessage.id,
      );
      const nextMessages = existingMessageIndex === -1
        ? [...currentWorkspace.messages, optimisticMessage]
        : currentWorkspace.messages.map((message, index) => (
          index === existingMessageIndex ? { ...message, ...optimisticMessage } : message
        ));
      const nextWorkspace = {
        ...currentWorkspace,
        messages: nextMessages,
        isSending: true,
        thinkingStatus: null,
        thinkingSourceEventType: null,
        currentTurnProjection: null,
        pendingTurn: normalizedPendingTurn,
      };
      const nextTurnConversationRefs = mergeTurnConversationRefs(
        state.turnConversationRefs,
        [optimisticMessage],
        normalizedPendingTurn.conversationRef,
      );
      return buildWorkspaceUpdate(state, workspaceRef, nextWorkspace, {
        activeConversationRef: normalizedPendingTurn.conversationRef,
        latestCurrentTurnProjection: null,
        turnConversationRefs: nextTurnConversationRefs,
        ...getProjectedWorkspaceFields(nextWorkspace),
      });
    }),

  setLatestCurrentTurnProjection: (currentTurnProjection) =>
    set((state) => {
      if (state.latestCurrentTurnProjection === currentTurnProjection) {
        return state;
      }
      return {
        latestCurrentTurnProjection: currentTurnProjection,
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
        thinkingSourceEventType: null,
        compactionDebugInfo: null,
        streamTracking: createInitialStreamTracking(),
        currentTurnProjection: null,
        pendingTurn: null,
      };
      return buildWorkspaceUpdate(state, targetWorkspaceRef, nextWorkspace);
    }),
}));
