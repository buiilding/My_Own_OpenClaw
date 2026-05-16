/**
 * Typed API Client for backend communication.
 * Uses typed IPC bridge instead of direct window.ipc calls.
 * Mirrors backend/src/api/schema.py
 */

import { IpcBridge, SEND_CHANNELS } from '../ipc/bridge';
import { getMemoryRetrievalInjectionEnabled } from '../../utils/memoryRetrievalPreference';
import type { CaptureMeta } from '../services/ScreenshotAttachmentPipeline';
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
   * Send a user query to the backend
   * @param {string} text
   * @param {string} conversationRef
   * @param {string|null} screenshotRef - Optional artifact reference for screenshot data
   * @param {string|null} screenshotUrl - Optional artifact URL (kept for caller compatibility; not sent)
   * @param {string[]|null} screenshotRefs - Optional artifact references for multi-image payloads
   */
  sendQuery: async (
    text: string,
    conversationRef: string,
    screenshotRef: string | null = null,
    screenshotUrl: string | null = null,
    screenshotRefs: string[] | null = null,
    captureMeta: CaptureMeta | null = null,
    attachmentContext: string | null = null,
    attachmentFilenames: string[] | null = null,
    screenshot: string | null = null,
    workspacePath: string | null = null,
  ): Promise<void> => {
    const normalizedScreenshotRef = normalizeNonEmptyString(screenshotRef);
    const normalizedScreenshotUrl = normalizeNonEmptyString(screenshotUrl);
    const normalizedInlineScreenshot = normalizeNonEmptyString(screenshot);
    const normalizedWorkspacePath = normalizeNonEmptyString(workspacePath);
    const normalizedScreenshotRefs = Array.isArray(screenshotRefs)
      ? screenshotRefs
        .map((ref) => normalizeNonEmptyString(ref))
        .filter((ref): ref is string => Boolean(ref))
      : [];
    const normalizedAttachmentFilenames = Array.isArray(attachmentFilenames)
      ? attachmentFilenames
        .filter((filename): filename is string => typeof filename === 'string' && filename.trim().length > 0)
        .map((filename) => filename.trim())
      : [];
    // System state and memories are automatically added by ipc.cjs
    IpcBridge.send(SEND_CHANNELS.TO_BACKEND, {
      type: 'query',
      payload: {
        text,
        conversation_ref: conversationRef,
        screenshot_ref: normalizedScreenshotRef,  // Optional screenshot reference
        screenshot: normalizedInlineScreenshot,
        screenshot_url: normalizedScreenshotUrl, // UI/local echo hint; stripped before backend send
        screenshot_refs: normalizedScreenshotRefs.length > 0 ? normalizedScreenshotRefs : null,
        capture_meta: captureMeta,
        attachment_context: (
          typeof attachmentContext === 'string' && attachmentContext.trim().length > 0
            ? attachmentContext
            : null
        ),
        attachment_filenames: normalizedAttachmentFilenames.length > 0
          ? normalizedAttachmentFilenames
          : null,
        workspace_path: normalizedWorkspacePath,
        memory_retrieval_enabled: getMemoryRetrievalInjectionEnabled(),
      }
    });
  },

  /**
   * Request cancellation of the currently active query stream
   */
  stopQuery: (conversationRef: string | null = null): void => {
    IpcBridge.send(SEND_CHANNELS.TO_BACKEND, {
      type: 'stop-query',
      payload: {
        conversation_ref: conversationRef,
      },
    });
  },

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

  sendRehydrateConversation: async (
    conversationRef: string,
    messages: RehydrateConversationEntry[],
    workspacePath: string | null = null,
  ): Promise<void> => {
    IpcBridge.send(SEND_CHANNELS.TO_BACKEND, {
      type: 'rehydrate-conversation',
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
