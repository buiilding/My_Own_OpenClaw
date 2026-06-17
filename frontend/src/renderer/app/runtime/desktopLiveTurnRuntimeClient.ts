/**
 * Coordinates the desktop live turn runtime client for the renderer UI.
 */

import {
  SDK_RUNTIME_COMMANDS,
  type AgentModelSelection,
  type TurnInputResource,
} from '../../infrastructure/api/agentSdkClient';
import { DesktopTranscriptSessionRuntimeClient } from './desktopTranscriptSessionRuntimeClient';
import { getMemoryRetrievalInjectionEnabled } from '../../utils/memoryRetrievalPreference';
import { invokeAgentSdkCommand } from './agentSdkCommandInvokeClient';
import { windieDesktopSkin } from '../skin/windieDesktopSkin';

type CaptureMeta = {
  source_w?: number;
  source_h?: number;
  crop_x?: number;
  crop_y?: number;
  crop_w?: number;
  crop_h?: number;
  desktop_virtual_bounds?: {
    x: number;
    y: number;
    width: number;
    height: number;
  } | null;
  monitor_id?: string | null;
  timestamp?: number;
  capture_engine?: string | null;
};

type SendConversationQueryInput = {
  text: string;
  conversationRef: string;
  screenshotRef?: string | null;
  screenshotUrl?: string | null;
  screenshotRefs?: string[] | null;
  captureMeta?: CaptureMeta | null;
  attachmentContext?: string | null;
  attachmentFilenames?: string[] | null;
  screenshot?: string | null;
  workspacePath?: string | null;
  resources?: TurnInputResource[] | null;
  metadata?: Record<string, unknown> | null;
  model?: AgentModelSelection | null;
  turnRef?: string | null;
};

function optionalString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function optionalStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const normalized = value
    .filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    .map((entry) => entry.trim());
  return normalized.length > 0 ? normalized : null;
}

function throwIfFailedIpcResult(result: unknown): void {
  if (!result || typeof result !== 'object' || !('ok' in result) || result.ok !== false) {
    return;
  }
  const message = 'error' in result && typeof result.error === 'string' && result.error.trim()
    ? result.error.trim()
    : windieDesktopSkin.runtime.sendCommandFailure;
  throw new Error(message);
}

/**
 * Renderer live-turn facade for SDK-backed query and stop commands.
 *
 * Continuity, transcript, replay, compaction, and settings behavior belongs in
 * focused runtime services instead of this live-turn command surface.
 */
export const DesktopLiveTurnRuntimeClient = {
  async sendQuery(input: SendConversationQueryInput): Promise<void> {
    const turnRef = optionalString(input.turnRef) ?? undefined;
    const result = await invokeAgentSdkCommand(SDK_RUNTIME_COMMANDS.CONVERSATION_SEND, {
      text: input.text,
      conversation_ref: optionalString(input.conversationRef) ?? '',
      query_message_id: turnRef ?? null,
      ...(input.model ? { model: input.model } : {}),
      id: turnRef ?? null,
      messageId: turnRef ?? null,
      message_id: turnRef ?? null,
      screenshot_ref: optionalString(input.screenshotRef) ?? null,
      screenshot_url: optionalString(input.screenshotUrl) ?? null,
      screenshot_refs: optionalStringArray(input.screenshotRefs) ?? null,
      capture_meta: input.captureMeta ?? null,
      attachment_context: optionalString(input.attachmentContext) ?? null,
      attachment_filenames: optionalStringArray(input.attachmentFilenames) ?? null,
      screenshot: optionalString(input.screenshot) ?? null,
      workspace_path: optionalString(input.workspacePath) ?? null,
      resources: Array.isArray(input.resources) ? input.resources : [],
      metadata: input.metadata && typeof input.metadata === 'object' && !Array.isArray(input.metadata)
        ? input.metadata
        : null,
      memory_retrieval_enabled: getMemoryRetrievalInjectionEnabled(),
    });
    throwIfFailedIpcResult(result);
  },

  async stop(conversationRef: string | null = null, turnRef: string | null = null): Promise<void> {
    const resolvedConversationRef = optionalString(conversationRef)
      ?? DesktopTranscriptSessionRuntimeClient.getActiveConversationRef();
    if (!resolvedConversationRef) {
      return;
    }
    const resolvedTurnRef = optionalString(turnRef);
    await invokeAgentSdkCommand(SDK_RUNTIME_COMMANDS.CONVERSATION_STOP, {
      conversation_ref: resolvedConversationRef,
      turn_ref: resolvedTurnRef,
    });
  },
};
