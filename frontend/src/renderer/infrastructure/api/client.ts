/**
 * Typed API Client for backend communication.
 * Uses typed IPC bridge instead of direct window.ipc calls.
 * Mirrors backend/src/api/schema.py
 */

import { IpcBridge, SEND_CHANNELS } from '../ipc/bridge';
import {
  buildModelSettingsPatch,
  type WindieModelSelection,
} from './windieSdkClient';

export const ApiClient = {
  /**
   * Request backend conversation-history compaction.
   * Used for dev harnessing and manual compaction triggers.
   */
  compactHistory: (force: boolean = true, conversationRef: string | null = null): void => {
    IpcBridge.send(SEND_CHANNELS.TO_BACKEND, {
      type: 'compact-history',
      payload: {
        force,
        conversation_ref: conversationRef,
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
   * Update backend model selection through the SDK model-selection contract.
   */
  setModel: (selection: WindieModelSelection): void => {
    IpcBridge.send(SEND_CHANNELS.TO_BACKEND, {
      type: 'update-settings',
      payload: buildModelSettingsPatch(selection, 'ApiClient.setModel'),
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
