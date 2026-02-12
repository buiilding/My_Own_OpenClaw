/**
 * Typed API Client for backend communication.
 * Uses typed IPC bridge instead of direct window.ipc calls.
 * Mirrors backend/src/api/schema.py
 */

import { IpcBridge, SEND_CHANNELS } from '../ipc/bridge';

export type RehydrateConversationEntry = {
  role: 'user' | 'assistant' | 'tool';
  content: string;
  message_type?: string;
  tool_name?: string | null;
  correlation_id?: string | null;
  timestamp?: string | null;
  screenshot_ref?: string | null;
  screenshot?: string | null;
};

export const ApiClient = {
  /**
   * Send a user query to the backend
   * @param {string} text
   * @param {string} conversationRef
   * @param {string|null} screenshotRef - Optional artifact reference for screenshot data
   * @param {string|null} screenshotUrl - Optional artifact URL (kept for caller compatibility; not sent)
   */
  sendQuery: async (
    text: string,
    conversationRef: string,
    screenshotRef: string | null = null,
    screenshotUrl: string | null = null
  ): Promise<void> => {
    void screenshotUrl;
    // System state and memories are automatically added by ipc.cjs
    IpcBridge.send(SEND_CHANNELS.TO_BACKEND, {
      type: 'query',
      payload: {
        text,
        conversation_ref: conversationRef,
        screenshot_ref: screenshotRef  // Optional screenshot reference
      }
    });
  },

  sendRehydrateConversation: async (
    conversationRef: string,
    messages: RehydrateConversationEntry[]
  ): Promise<void> => {
    IpcBridge.send(SEND_CHANNELS.TO_BACKEND, {
      type: 'rehydrate-conversation',
      payload: {
        conversation_ref: conversationRef,
        messages,
        rehydrate_mode: 'replace',
      },
    });
  },

  /**
   * Request a list of available LLM models
   */
  listModels: (): void => {
    IpcBridge.send(SEND_CHANNELS.TO_BACKEND, {
      type: 'list-models'
    });
  },

  /**
   * Update session settings on the backend
   * @param {Record<string, any>} config - Frontend-managed config fields
   */
  updateSettings: (config: Record<string, any>): void => {
    IpcBridge.send(SEND_CHANNELS.TO_BACKEND, {
      type: 'update-settings',
      payload: config
    });
  },

  /**
   * Notify backend that wakeword was detected
   */
  wakewordDetected: (): void => {
    IpcBridge.send(SEND_CHANNELS.TO_BACKEND, {
      type: 'wakeword-detected',
      payload: {}
    });
  }
};
