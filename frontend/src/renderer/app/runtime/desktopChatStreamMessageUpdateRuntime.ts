/**
 * Normalizes renderer chat-stream message update payloads.
 */

import type { ToolSchema } from '../../types/toolSchemas';
import { DesktopChatMessageRuntimeClient } from './desktopChatMessageRuntimeClient';

const {
  normalizeIncomingText,
  normalizeToolSchemaList,
} = DesktopChatMessageRuntimeClient;

type SystemPromptPayload = {
  content?: unknown;
  tool_schemas?: unknown;
};

type UserMessageFullPayload = {
  content?: unknown;
  metadata?: unknown;
};

type AssistantMessageFullPayload = {
  content?: unknown;
};

function normalizeToolSchemas(value: unknown): ToolSchema[] | undefined {
  return normalizeToolSchemaList(value);
}

function buildToolSchemasUpdate(payload: { tool_schemas?: unknown } | null | undefined) {
  return {
    toolSchemas: normalizeToolSchemas(payload?.tool_schemas),
  };
}

function buildSystemPromptUpdate(payload: SystemPromptPayload | null | undefined) {
  return {
    content: normalizeIncomingText(payload?.content),
    toolSchemas: normalizeToolSchemas(payload?.tool_schemas),
  };
}

function buildUserMessageFullUpdate(payload: UserMessageFullPayload | null | undefined) {
  const metadata = payload?.metadata;
  return {
    content: normalizeIncomingText(payload?.content),
    metadata: metadata && typeof metadata === 'object' && !Array.isArray(metadata)
      ? metadata as Record<string, unknown>
      : undefined,
  };
}

function buildAssistantMessageFullUpdate(payload: AssistantMessageFullPayload | null | undefined) {
  return {
    content: normalizeIncomingText(payload?.content),
  };
}

export const DesktopChatStreamMessageUpdateRuntime = Object.freeze({
  buildToolSchemasUpdate,
  buildSystemPromptUpdate,
  buildUserMessageFullUpdate,
  buildAssistantMessageFullUpdate,
});
