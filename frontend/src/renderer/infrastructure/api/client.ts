/**
 * Typed API Client for backend communication.
 * Uses typed IPC bridge instead of direct window.ipc calls.
 * Mirrors backend/src/api/schema.py
 */

import { IpcBridge, SEND_CHANNELS } from '../ipc/bridge';
import { normalizeNonEmptyString } from '../../utils/normalizeNonEmptyString';
import {
  buildModelSettingsPatch,
  type WindieModelSelection,
} from './windieSdkClient';

export type RehydrateConversationEntry = {
  role: 'user' | 'assistant' | 'tool';
  content: string;
  message_type?: string;
  tool_name?: string | null;
  correlation_id?: string | null;
  tool_call_id?: string | null;
  tool_calls?: Array<Record<string, unknown>> | null;
  timestamp?: string | null;
  screenshot_ref?: string | null;
  screenshot?: string | null;
  image_data?: string | string[] | null;
  transparency?: Record<string, unknown> | null;
  structured_content?: Array<Record<string, unknown>> | null;
  compaction_facts?: Record<string, unknown> | null;
  structured_payload?: Record<string, unknown> | null;
};

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

  rehydrateConversation: async (
    conversationRef: string,
    messages: RehydrateConversationEntry[],
    workspacePath: string | null = null,
  ): Promise<void> => {
    IpcBridge.send(SEND_CHANNELS.TO_BACKEND, {
      type: 'rehydrate',
      payload: {
        conversation_ref: conversationRef,
        messages,
        rehydrate_mode: 'replace',
        workspace_path: normalizeNonEmptyString(workspacePath),
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
