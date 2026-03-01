/**
 * Typed API Client for backend communication.
 * Uses typed IPC bridge instead of direct window.ipc calls.
 * Mirrors backend/src/api/schema.py
 */

import { IpcBridge, SEND_CHANNELS } from '../ipc/bridge';
import { getMemoryRetrievalInjectionEnabled } from '../../utils/memoryRetrievalPreference';
import type { CaptureMeta } from '../services/SystemCapture';

type RehydrateConversationEntry = {
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
  transparency?: Record<string, unknown> | null;
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
  ): Promise<void> => {
    void screenshotUrl;
    const normalizedScreenshotRefs = Array.isArray(screenshotRefs)
      ? screenshotRefs.filter((ref): ref is string => typeof ref === 'string' && ref.length > 0)
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
        screenshot_ref: screenshotRef,  // Optional screenshot reference
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
  compactHistory: (force: boolean = true): void => {
    IpcBridge.send(SEND_CHANNELS.TO_BACKEND, {
      type: 'compact-history',
      payload: { force },
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
