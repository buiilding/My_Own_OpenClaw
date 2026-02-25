/**
 * Chat Store (Zustand).
 * Manages chat state: messages, sending status, thinking status, token counts.
 * Pure state management - no business logic.
 */

import { create } from 'zustand';

/**
 * Message type definition
 */
export interface ChatMessage {
  id: string;
  text: string;
  sender: 'user' | 'assistant';
  turnRef?: string;
  type?: 'llm-text' | 'tool-call' | 'tool-output' | 'error';
  isComplete?: boolean;
  screenshot?: string | null;
  screenshotRef?: string | null;
  screenshotUrl?: string | null;
  screenshotContentType?: string | null;
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
  } | null;
  modelFacingToolOutput?: string | null;
  toolCallDetails?: Record<string, unknown> | null;
  toolOutputDetails?: Record<string, unknown> | null;
  systemPrompt?: {
    content: string;
    toolSchemas?: any;
  };
  toolSchemas?: any;
  fullUserMessage?: {
    content: string;
    metadata?: Record<string, unknown>;
  };
  fullAssistantMessage?: {
    content: string;
  };
  feedback?: 'like' | 'dislike' | null;
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

/**
 * Chat store state
 */
interface ChatState {
  // State
  messages: ChatMessage[];
  isSending: boolean;
  thinkingStatus: string | null;
  tokenCounts: TokenCounts | null;
  streamTracking: StreamTracking;

  // Actions
  addMessage: (message: ChatMessage) => void;
  updateMessage: (id: string, updates: Partial<ChatMessage>) => void;
  setMessages: (messages: ChatMessage[]) => void;
  setIsSending: (isSending: boolean) => void;
  setThinkingStatus: (status: string | null) => void;
  setTokenCounts: (counts: TokenCounts | null) => void;
  updateStreamTracking: (updater: (current: StreamTracking) => StreamTracking) => void;
  clearMessages: () => void;
}

function createInitialStreamTracking(): StreamTracking {
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

/**
 * Chat store
 * Uses shallow equality for better performance with Zustand
 */
export const useChatStore = create<ChatState>((set) => ({
  // Initial state
  messages: [],
  isSending: false,
  thinkingStatus: null,
  tokenCounts: null,
  streamTracking: createInitialStreamTracking(),

  // Actions
  addMessage: (message) =>
    set((state) => ({
      messages: [...state.messages, message],
    })),

  updateMessage: (id, updates) =>
    set((state) => {
      const index = state.messages.findIndex((message) => message.id === id);
      if (index === -1) {
        return state;
      }

      const nextMessages = [...state.messages];
      nextMessages[index] = { ...nextMessages[index], ...updates };
      return { messages: nextMessages };
    }),

  setMessages: (messages) =>
    set((state) => (state.messages === messages ? state : { messages })),

  setIsSending: (isSending) =>
    set((state) => (state.isSending === isSending ? state : { isSending })),

  setThinkingStatus: (thinkingStatus) =>
    set((state) => (state.thinkingStatus === thinkingStatus ? state : { thinkingStatus })),

  setTokenCounts: (tokenCounts) =>
    set((state) => (state.tokenCounts === tokenCounts ? state : { tokenCounts })),

  updateStreamTracking: (updater) =>
    set((state) => ({
      streamTracking: updater(state.streamTracking),
    })),

  clearMessages: () => set({
    messages: [],
    streamTracking: createInitialStreamTracking(),
  }),
}));
