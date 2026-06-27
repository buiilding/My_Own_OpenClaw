/**
 * Coordinates the live-turn app-runtime client for the renderer UI.
 */

import {
  DesktopConversationRuntimeContracts,
  type AgentModelSelection,
  type TurnInputResource,
} from './desktopConversationRuntimeContracts';
import { DesktopTranscriptSessionRuntimeClient } from './desktopTranscriptSessionRuntimeClient';
import { DesktopMemoryRetrievalPreferenceRuntime } from './desktopMemoryRetrievalPreferenceRuntime';
import { AgentSdkCommandInvokeClient } from './agentSdkCommandInvokeClient';

const SEND_COMMAND_FAILURE_FALLBACK = 'Failed to send command to the renderer app runtime';
const {
  SDK_RUNTIME_COMMANDS,
} = DesktopConversationRuntimeContracts;
const {
  invokeAgentSdkCommand,
} = AgentSdkCommandInvokeClient;

type SendConversationQueryInput = {
  text: string;
  conversationRef: string;
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

function throwIfFailedIpcResult(result: unknown): void {
  if (!result || typeof result !== 'object' || !('ok' in result) || result.ok !== false) {
    return;
  }
  const message = 'error' in result && typeof result.error === 'string' && result.error.trim()
    ? result.error.trim()
    : SEND_COMMAND_FAILURE_FALLBACK;
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
      workspace_path: optionalString(input.workspacePath) ?? null,
      resources: Array.isArray(input.resources) ? input.resources : [],
      metadata: input.metadata && typeof input.metadata === 'object' && !Array.isArray(input.metadata)
        ? input.metadata
        : null,
      memory_retrieval_enabled: DesktopMemoryRetrievalPreferenceRuntime.getMemoryRetrievalInjectionEnabled(),
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
