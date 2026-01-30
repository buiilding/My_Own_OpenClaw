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
   * @param {Record<string, any>} config - Optional config dictionary to send with query
   */
  sendQuery: async (
    text: string, 
    screenshot: string | null = null,
    config?: Record<string, any>
  ): Promise<void> => {
    const configToSend = config || undefined;
    
    // Log what config is being sent
    if (configToSend) {
      console.log('[ApiClient] Sending query with config:', {
        model_mode: configToSend.model_mode,
        model_provider: configToSend.model_provider,
        selected_model_id: configToSend.selected_model_id,
        speech_mode_enabled: configToSend.speech_mode_enabled,
        voice_mode_enabled: configToSend.voice_mode_enabled,
        all_keys: Object.keys(configToSend)
      });
    } else {
      console.log('[ApiClient] Sending query without config (config is null/undefined)');
    }
    
    // System state and memories are automatically added by ipc.cjs
    IpcBridge.send(SEND_CHANNELS.TO_BACKEND, {
      type: 'query',
      payload: {
        text,
        screenshot: screenshot,  // Optional screenshot data
        config: configToSend  // Send as config dictionary, not spread
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
   * Notify backend that wakeword was detected
   */
  wakewordDetected: (): void => {
    IpcBridge.send(SEND_CHANNELS.TO_BACKEND, {
      type: 'wakeword-detected',
      payload: {}
    });
  }
};
