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
  type?: 'llm-text' | 'tool-call' | 'tool-output' | 'error';
  isComplete?: boolean;
  screenshot?: string | null;
  screenshotRef?: string | null;
  screenshotUrl?: string | null;
  toolMetadata?: Record<string, unknown> | null;
  toolName?: string;
  executionTime?: number | null;
  success?: boolean;
  correlationId?: string;
  timestamp?: string;
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
}

/**
 * Token counts structure
 */
export interface TokenCounts {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
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

  // Actions
  addMessage: (message: ChatMessage) => void;
  updateMessage: (id: string, updates: Partial<ChatMessage>) => void;
  setMessages: (messages: ChatMessage[]) => void;
  setIsSending: (isSending: boolean) => void;
  setThinkingStatus: (status: string | null) => void;
  setTokenCounts: (counts: TokenCounts | null) => void;
  clearMessages: () => void;
}

/**
 * Initial message
 */
const initialMessage: ChatMessage = {
  id: crypto.randomUUID(),
  text: 'Hello! How can I help you today?',
  sender: 'assistant',
};

/**
 * Chat store
 * Uses shallow equality for better performance with Zustand
 */
export const useChatStore = create<ChatState>((set) => ({
  // Initial state
  messages: [initialMessage],
  isSending: false,
  thinkingStatus: null,
  tokenCounts: null,

  // Actions
  addMessage: (message) =>
    set((state) => ({
      messages: [...state.messages, message],
    })),

  updateMessage: (id, updates) =>
    set((state) => ({
      messages: state.messages.map((msg) =>
        msg.id === id ? { ...msg, ...updates } : msg
      ),
    })),

  setMessages: (messages) => set({ messages }),

  setIsSending: (isSending) => set({ isSending }),

  setThinkingStatus: (thinkingStatus) => set({ thinkingStatus }),

  setTokenCounts: (tokenCounts) => set({ tokenCounts }),

  clearMessages: () => set({ messages: [initialMessage] }),
}));
