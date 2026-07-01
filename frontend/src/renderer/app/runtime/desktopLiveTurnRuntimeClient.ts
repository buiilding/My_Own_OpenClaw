/**
 * Coordinates the live-turn app-runtime client for the renderer UI.
 */

import {
  DesktopConversationRuntimeContracts,
  type TurnInputResource,
} from './desktopConversationRuntimeContracts';
import { DesktopTranscriptSessionRuntimeClient } from './desktopTranscriptSessionRuntimeClient';
import { DesktopMemoryRetrievalPreferenceRuntime } from './desktopMemoryRetrievalPreferenceRuntime';
import { AgentSdkCommandInvokeClient } from './agentSdkCommandInvokeClient';

const INVALID_SEND_IDENTITY_ERROR = 'conversation.send requires exact non-empty conversationRef and turnRef values';
const INVALID_SEND_RESOURCES_ERROR = 'conversation.send resources must use typed SDK resource shapes';
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
  turnRef?: string | null;
};

function optionalExactString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 && value === value.trim()
    ? value
    : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function optionalBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function requiredField(value: unknown): { required: boolean } | Record<string, never> {
  const required = optionalBoolean(value);
  return required === null ? {} : { required };
}

function optionalExactField<TKey extends string>(
  key: TKey,
  value: unknown,
): { [K in TKey]: string } | Record<string, never> {
  const exactValue = optionalExactString(value);
  return exactValue ? { [key]: exactValue } as { [K in TKey]: string } : {};
}

function hasOnlyAllowedResourceKeys(
  resource: Record<string, unknown>,
  allowedKeys: readonly string[],
): boolean {
  return Object.keys(resource).every((key) => allowedKeys.includes(key));
}

function normalizeTurnInputResource(resource: unknown): TurnInputResource | null {
  if (!isRecord(resource)) {
    return null;
  }
  if (resource.kind === 'readable_file') {
    if (!hasOnlyAllowedResourceKeys(resource, ['kind', 'filePath', 'filename', 'required'])) {
      return null;
    }
    const filePath = optionalExactString(resource.filePath);
    const filename = optionalExactString(resource.filename);
    return filePath && filename
      ? {
        kind: 'readable_file',
        filePath,
        filename,
        ...requiredField(resource.required),
      }
      : null;
  }
  if (resource.kind === 'clipboard_image') {
    if (!hasOnlyAllowedResourceKeys(resource, ['kind', 'base64', 'contentType', 'filename', 'required'])) {
      return null;
    }
    const base64 = optionalExactString(resource.base64);
    if (!base64) {
      return null;
    }
    return {
      kind: 'clipboard_image',
      base64,
      ...optionalExactField('contentType', resource.contentType),
      ...optionalExactField('filename', resource.filename),
      ...requiredField(resource.required),
    };
  }
  if (resource.kind === 'query_screenshot_request') {
    if (!hasOnlyAllowedResourceKeys(resource, ['kind', 'isFirstUserMessage', 'reason', 'required'])) {
      return null;
    }
    const isFirstUserMessage = optionalBoolean(resource.isFirstUserMessage);
    return {
      kind: 'query_screenshot_request',
      ...(isFirstUserMessage === null ? {} : { isFirstUserMessage }),
      ...optionalExactField('reason', resource.reason),
      ...requiredField(resource.required),
    };
  }
  if (resource.kind === 'workspace') {
    if (!hasOnlyAllowedResourceKeys(resource, ['kind', 'workspacePath', 'required'])) {
      return null;
    }
    const workspacePath = optionalExactString(resource.workspacePath);
    return workspacePath
      ? {
        kind: 'workspace',
        workspacePath,
        ...requiredField(resource.required),
      }
      : null;
  }
  return null;
}

function normalizeTurnInputResources(resources: unknown): TurnInputResource[] | null {
  if (resources === null || resources === undefined) {
    return [];
  }
  if (!Array.isArray(resources)) {
    return null;
  }
  const normalizedResources: TurnInputResource[] = [];
  for (const resource of resources) {
    const normalizedResource = normalizeTurnInputResource(resource);
    if (!normalizedResource) {
      return null;
    }
    normalizedResources.push(normalizedResource);
  }
  return normalizedResources;
}

function throwIfFailedIpcResult(result: unknown): void {
  if (!result || typeof result !== 'object' || !('ok' in result) || result.ok !== false) {
    return;
  }
  const message = 'error' in result
    ? optionalExactString(result.error) ?? SEND_COMMAND_FAILURE_FALLBACK
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
    const conversationRef = optionalExactString(input.conversationRef);
    const hasExplicitTurnRef = input.turnRef !== null && input.turnRef !== undefined;
    const turnRef = optionalExactString(input.turnRef) ?? undefined;
    if (!conversationRef || (hasExplicitTurnRef && !turnRef)) {
      throw new Error(INVALID_SEND_IDENTITY_ERROR);
    }
    const resources = normalizeTurnInputResources(input.resources);
    if (!resources) {
      throw new Error(INVALID_SEND_RESOURCES_ERROR);
    }
    const result = await invokeAgentSdkCommand(SDK_RUNTIME_COMMANDS.CONVERSATION_SEND, {
      text: input.text,
      conversation_ref: conversationRef,
      query_message_id: turnRef ?? null,
      workspace_path: optionalExactString(input.workspacePath) ?? null,
      resources,
      memory_retrieval_enabled: DesktopMemoryRetrievalPreferenceRuntime.getMemoryRetrievalInjectionEnabled(),
    });
    throwIfFailedIpcResult(result);
  },

  async stop(conversationRef: string | null = null, turnRef: string | null = null): Promise<void> {
    const hasExplicitConversationRef = conversationRef !== null && conversationRef !== undefined;
    const hasExplicitTurnRef = turnRef !== null && turnRef !== undefined;
    const resolvedConversationRef = hasExplicitConversationRef
      ? optionalExactString(conversationRef)
      : optionalExactString(DesktopTranscriptSessionRuntimeClient.getActiveConversationRef());
    if (!resolvedConversationRef) {
      return;
    }
    const resolvedTurnRef = optionalExactString(turnRef);
    if (hasExplicitTurnRef && !resolvedTurnRef) {
      return;
    }
    await invokeAgentSdkCommand(SDK_RUNTIME_COMMANDS.CONVERSATION_STOP, {
      conversation_ref: resolvedConversationRef,
      turn_ref: resolvedTurnRef,
    });
  },
};
