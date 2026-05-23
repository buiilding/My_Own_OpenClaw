import type { ChatMessage } from '../../features/chat/stores/chatStore';
import {
  type DisplayConversation,
  type DisplayMessage,
} from '../api/windieSdkClient';
import { buildAssistantTextChatMessageState } from './assistantTextChatMessageState';
import { buildToolCallChatMessageState } from './toolCallChatMessageState';
import { buildToolOutputChatMessageState } from './toolOutputChatMessageState';
import { resolveScreenshotAttachmentState } from '../services/screenshotMessageState';

function recordField(record: Record<string, unknown> | null | undefined, key: string): unknown {
  return record && typeof record === 'object' ? record[key] : undefined;
}

function stringField(record: Record<string, unknown> | null | undefined, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = recordField(record, key);
    if (typeof value === 'string' && value.trim()) {
      return value;
    }
  }
  return null;
}

function recordPayload(message: DisplayMessage): Record<string, unknown> {
  return message.metadata && typeof message.metadata === 'object'
    ? message.metadata
    : {};
}

function structuredPayload(message: DisplayMessage): Record<string, unknown> {
  const payload = recordPayload(message).structuredPayload;
  return payload && typeof payload === 'object' && !Array.isArray(payload)
    ? payload as Record<string, unknown>
    : {};
}

function screenshotFieldsFromPayload(payload: Record<string, unknown>): Partial<ChatMessage> {
  const screenshotState = resolveScreenshotAttachmentState({
    screenshot: stringField(payload, 'screenshot', 'image'),
    screenshotRef: stringField(payload, 'screenshotRef', 'screenshot_ref'),
    screenshotUrl: stringField(payload, 'screenshotUrl', 'screenshot_url'),
    screenshotContentType: stringField(payload, 'screenshotContentType', 'screenshot_content_type'),
    inferArtifactRefFromScreenshot: true,
    preserveInlineScreenshotWithRemote: false,
  });
  return {
    ...(screenshotState.screenshot ? { screenshot: screenshotState.screenshot } : {}),
    ...(screenshotState.screenshotRef ? { screenshotRef: screenshotState.screenshotRef } : {}),
    ...(screenshotState.screenshotUrl ? { screenshotUrl: screenshotState.screenshotUrl } : {}),
    ...(screenshotState.screenshotContentType ? { screenshotContentType: screenshotState.screenshotContentType } : {}),
  };
}

function firstToolCall(message: DisplayMessage): Record<string, unknown> | null {
  const payload = recordPayload(message);
  const structured = structuredPayload(message);
  const candidate = recordField(payload, 'toolCalls')
    ?? recordField(payload, 'tool_calls')
    ?? recordField(structured, 'tool_calls');
  if (!Array.isArray(candidate)) {
    return null;
  }
  const first = candidate[0];
  return first && typeof first === 'object' && !Array.isArray(first)
    ? first as Record<string, unknown>
    : null;
}

function recordFromPayloadValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function buildUserChatMessage(message: DisplayMessage): ChatMessage {
  const payload = recordPayload(message);
  return {
    id: message.id,
    text: message.text,
    sender: 'user',
    timestamp: message.timestamp,
    isComplete: true,
    ...screenshotFieldsFromPayload(payload),
  };
}

function buildAssistantChatMessage(message: DisplayMessage): ChatMessage {
  const base = buildAssistantTextChatMessageState({
    id: message.id,
    text: message.text,
    sourceEventType: message.messageType,
    turnRef: message.turnRef ?? null,
    isComplete: true,
  }) as ChatMessage;
  return {
    ...base,
    timestamp: message.timestamp,
  };
}

function buildToolCallMessage(message: DisplayMessage): ChatMessage {
  const payload = recordPayload(message);
  const toolCall = firstToolCall(message);
  const args = recordFromPayloadValue(recordField(payload, 'args'));
  const fallbackToolCall = toolCall ?? (
    message.toolName
      ? {
        id: message.toolCallId ?? message.correlationId ?? undefined,
        name: message.toolName,
        arguments: args ?? undefined,
      }
      : null
  );
  const base = buildToolCallChatMessageState({
    id: message.id,
    text: message.text,
    toolCallDisplayText: message.text,
    modelFacingToolCall: fallbackToolCall,
    toolCallDetails: payload,
    correlationId: message.requestId ?? message.bundleId ?? message.toolCallId ?? message.correlationId ?? null,
    sourceEventType: message.messageType,
    turnRef: message.turnRef ?? null,
    isComplete: true,
  }) as ChatMessage;
  return {
    ...base,
    timestamp: message.timestamp,
  };
}

function buildToolOutputMessage(message: DisplayMessage): ChatMessage {
  const payload = recordPayload(message);
  const base = buildToolOutputChatMessageState({
    id: message.id,
    outputText: message.text,
    sourceEventType: message.messageType,
    ...screenshotFieldsFromPayload(payload),
    toolName: message.toolName ?? null,
    success: typeof payload.success === 'boolean' ? payload.success : null,
    correlationId: message.requestId ?? message.bundleId ?? message.toolCallId ?? message.correlationId ?? null,
    toolOutputDetails: payload,
    turnRef: message.turnRef ?? null,
    isComplete: true,
    preserveNullAttachmentFields: false,
    preserveNullToolMetadata: false,
    preserveNullToolOutputDetails: false,
  }) as ChatMessage;
  return {
    ...base,
    timestamp: message.timestamp,
  };
}

export function buildChatMessagesFromDisplayConversation(
  display: DisplayConversation,
): ChatMessage[] {
  return display.messages.flatMap((message) => {
    if (message.sender === 'user') {
      return [buildUserChatMessage(message)];
    }
    if (message.messageType === 'tool_call' || message.messageType === 'tool_bundle_call') {
      return [buildToolCallMessage(message)];
    }
    if (message.messageType === 'tool_output' || message.messageType === 'tool_bundle_output') {
      return [buildToolOutputMessage(message)];
    }
    if (message.sender === 'assistant') {
      return [buildAssistantChatMessage(message)];
    }
    return [];
  });
}
