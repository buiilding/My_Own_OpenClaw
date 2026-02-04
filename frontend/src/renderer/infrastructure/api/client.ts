/**
 * Typed API Client for backend communication.
 * Uses typed IPC bridge instead of direct window.ipc calls.
 * Mirrors backend/src/api/schema.py
 */

import { IpcBridge, SEND_CHANNELS } from '../ipc/bridge';

export const ApiClient = {
  /**
   * Send a user query to the backend
   * @param {string} text
   * @param {string|null} screenshot - Optional base64-encoded screenshot data
   */
  sendQuery: async (
    text: string, 
    screenshot: string | null = null
  ): Promise<void> => {
    // System state and memories are automatically added by ipc.cjs
    IpcBridge.send(SEND_CHANNELS.TO_BACKEND, {
      type: 'query',
      payload: {
        text,
        screenshot: screenshot  // Optional screenshot data
      }
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
