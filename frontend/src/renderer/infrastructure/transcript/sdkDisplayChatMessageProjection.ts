/**
 * Projects sdk display chat message state for the renderer UI.
 */

import type { ChatMessage } from '../../app/runtime/desktopChatMessageTypes';
import {
  type SdkDisplayRow,
  type DisplayMessage,
} from '../api/agentSdkClient';
import { buildAssistantTextChatMessageState } from './assistantTextChatMessageState';
import { buildToolCallChatMessageState } from './toolCallChatMessageState';
import { buildToolOutputChatMessageState } from './toolOutputChatMessageState';
import {
  buildRemoteScreenshotAttachments,
  resolveScreenshotAttachmentState,
} from '../services/screenshotMessageState';
import { SDK_DISPLAY_ROWS_SOURCE_CHANNEL } from '../../app/runtime/desktopPresentationSourceChannels';

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

function stringArrayField(record: Record<string, unknown> | null | undefined, ...keys: string[]): string[] | null {
  for (const key of keys) {
    const value = recordField(record, key);
    if (!Array.isArray(value)) {
      continue;
    }
    const normalized = value
      .filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
      .map((entry) => entry.trim());
    if (normalized.length > 0) {
      return normalized;
    }
  }
  return null;
}

function recordPayload(message: DisplayMessage): Record<string, unknown> {
  return message.metadata && typeof message.metadata === 'object'
    ? message.metadata
    : {};
}

function recordPayloadFromRow(row: SdkDisplayRow): Record<string, unknown> {
  const metadata = row.metadata;
  if (!metadata || typeof metadata !== 'object') {
    return {};
  }
  const payload: Record<string, unknown> = {};
  const copyKeys: Array<keyof typeof metadata> = [
    'reasoningText',
    'toolName',
    'requestId',
    'correlationId',
    'bundleId',
    'toolCallId',
    'modelFacingToolCall',
    'structuredPayload',
    'screenshotRef',
    'screenshotUrl',
    'screenshotRefs',
    'screenshot',
    'screenshotContentType',
    'sourceEventType',
    'success',
    'modelId',
    'modelProvider',
  ];
  copyKeys.forEach((key) => {
    const value = metadata[key];
    if (value !== undefined && value !== null) {
      payload[key] = value;
    }
  });
  return payload;
}

function displayTextFromRowContent(content: unknown): string {
  return typeof content === 'string' ? content : JSON.stringify(content, null, 2);
}

function screenshotFieldsFromPayload(payload: Record<string, unknown>): Partial<ChatMessage> {
  const screenshotRef = stringField(payload, 'screenshotRef');
  const screenshotUrl = stringField(payload, 'screenshotUrl');
  const screenshotRefs = stringArrayField(payload, 'screenshotRefs');
  const screenshotState = resolveScreenshotAttachmentState({
    screenshot: stringField(payload, 'screenshot'),
    screenshotRef,
    screenshotUrl,
    screenshotContentType: stringField(payload, 'screenshotContentType'),
    preserveInlineScreenshotWithRemote: false,
  });
  const screenshotAttachments = buildRemoteScreenshotAttachments(
    screenshotRefs ?? (screenshotState.screenshotRef ? [screenshotState.screenshotRef] : null),
    screenshotState.screenshotUrl,
  );
  return {
    ...(screenshotState.screenshot ? { screenshot: screenshotState.screenshot } : {}),
    ...(screenshotState.screenshotRef ? { screenshotRef: screenshotState.screenshotRef } : {}),
    ...(screenshotState.screenshotUrl ? { screenshotUrl: screenshotState.screenshotUrl } : {}),
    ...(screenshotState.screenshotContentType ? { screenshotContentType: screenshotState.screenshotContentType } : {}),
    ...(screenshotAttachments.length > 0 ? { screenshots: screenshotAttachments } : {}),
  };
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
  const payload = recordPayload(message);
  const thinkingText = stringField(payload, 'reasoningText', 'reasoning_text');
  const base = buildAssistantTextChatMessageState({
    id: message.id,
    text: message.text,
    sourceEventType: message.messageType,
    turnRef: message.turnRef ?? null,
    isComplete: message.messageType !== 'assistant_delta',
    thinkingText,
    thinkingSourceEventType: thinkingText ? 'reasoning_delta' : null,
  }) as ChatMessage;
  return {
    ...base,
    timestamp: message.timestamp,
  };
}

function buildToolCallMessage(message: DisplayMessage): ChatMessage {
  const payload = recordPayload(message);
  const toolCall = recordFromPayloadValue(recordField(payload, 'modelFacingToolCall'));
  const args = recordFromPayloadValue(recordField(payload, 'args'));
  const bundleToolCallPayload = message.messageType === 'tool_bundle_call'
    ? recordPayload(message)
    : null;
  const fallbackToolCall = bundleToolCallPayload ?? toolCall ?? (
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

function buildToolProgressMessage(message: DisplayMessage): ChatMessage {
  const payload = recordPayload(message);
  const sourceEventType = recordField(payload, 'sourceEventType');
  return {
    id: message.id,
    text: message.text,
    sender: 'assistant',
    type: 'search-source',
    sourceEventType: typeof sourceEventType === 'string' && sourceEventType.trim()
      ? sourceEventType
      : 'web-search-progress',
    sourceChannel: SDK_DISPLAY_ROWS_SOURCE_CHANNEL,
    turnRef: message.turnRef ?? undefined,
    timestamp: message.timestamp,
    toolName: message.toolName ?? undefined,
    toolMetadata: payload,
    correlationId: message.requestId ?? message.correlationId ?? undefined,
  };
}

function buildChatMessagesFromDisplayMessage(message: DisplayMessage): ChatMessage[] {
  if (message.sender === 'user') {
    return [buildUserChatMessage(message)];
  }
  if (message.messageType === 'tool_call' || message.messageType === 'tool_bundle_call') {
    return [buildToolCallMessage(message)];
  }
  if (message.messageType === 'tool_output' || message.messageType === 'tool_bundle_output') {
    return [buildToolOutputMessage(message)];
  }
  if (message.messageType === 'tool_progress') {
    return [buildToolProgressMessage(message)];
  }
  if (message.sender === 'assistant') {
    return [buildAssistantChatMessage(message)];
  }
  return [];
}

function displayMessageFromSdkDisplayRow(row: SdkDisplayRow): DisplayMessage | null {
  const payload = recordPayloadFromRow(row);
  const revisionId = typeof row.metadata?.revisionId === 'string' ? row.metadata.revisionId : '';
  const timestamp = typeof row.metadata?.timestamp === 'string' ? row.metadata.timestamp : '';
  if (row.type === 'reasoning') {
    return null;
  }
  if (row.type === 'error') {
    return {
      id: row.id,
      conversationRef: row.conversationRef,
      turnRef: row.turnRef,
      revisionId,
      timestamp,
      sender: 'system',
      text: row.content,
      messageType: 'runtime_error',
      metadata: payload,
    };
  }
  if (row.type === 'tool_call') {
    const content = row.content;
    const modelFacingToolCall = recordFromPayloadValue(row.metadata?.modelFacingToolCall) ?? content;
    return {
      id: row.id,
      conversationRef: row.conversationRef,
      turnRef: row.turnRef,
      revisionId,
      timestamp,
      sender: 'tool',
      text: displayTextFromRowContent(content),
      messageType: 'tool_call',
      toolName: row.metadata?.toolName ?? null,
      requestId: row.metadata?.requestId ?? null,
      bundleId: row.metadata?.bundleId ?? null,
      toolCallId: row.metadata?.toolCallId ?? null,
      correlationId: row.metadata?.correlationId ?? null,
      metadata: {
        ...payload,
        modelFacingToolCall,
      },
    };
  }
  if (row.type === 'tool_progress') {
    return {
      id: row.id,
      conversationRef: row.conversationRef,
      turnRef: row.turnRef,
      revisionId,
      timestamp,
      sender: 'assistant',
      text: row.content,
      messageType: 'tool_progress',
      toolName: row.metadata?.toolName ?? 'web_search',
      requestId: row.metadata?.requestId ?? null,
      bundleId: row.metadata?.bundleId ?? null,
      toolCallId: row.metadata?.toolCallId ?? null,
      correlationId: row.metadata?.correlationId ?? null,
      metadata: payload,
    };
  }
  if (row.type === 'tool_bundle_call') {
    const content = row.content;
    return {
      id: row.id,
      conversationRef: row.conversationRef,
      turnRef: row.turnRef,
      revisionId,
      timestamp,
      sender: 'tool',
      text: displayTextFromRowContent(content),
      messageType: 'tool_bundle_call',
      toolName: row.metadata?.toolName ?? null,
      requestId: row.metadata?.requestId ?? null,
      bundleId: row.metadata?.bundleId ?? null,
      toolCallId: row.metadata?.toolCallId ?? null,
      correlationId: row.metadata?.correlationId ?? null,
      metadata: {
        ...payload,
        ...content,
      },
    };
  }
  if (row.type === 'tool_output') {
    return {
      id: row.id,
      conversationRef: row.conversationRef,
      turnRef: row.turnRef,
      revisionId,
      timestamp,
      sender: 'tool',
      text: row.content,
      messageType: 'tool_output',
      toolName: row.metadata?.toolName ?? null,
      requestId: row.metadata?.requestId ?? null,
      bundleId: row.metadata?.bundleId ?? null,
      toolCallId: row.metadata?.toolCallId ?? null,
      correlationId: row.metadata?.correlationId ?? null,
      metadata: payload,
    };
  }
  if (row.type === 'tool_bundle_output') {
    const content = row.content;
    return {
      id: row.id,
      conversationRef: row.conversationRef,
      turnRef: row.turnRef,
      revisionId,
      timestamp,
      sender: 'tool',
      text: displayTextFromRowContent(content),
      messageType: 'tool_bundle_output',
      toolName: row.metadata?.toolName ?? null,
      requestId: row.metadata?.requestId ?? null,
      bundleId: row.metadata?.bundleId ?? null,
      toolCallId: row.metadata?.toolCallId ?? null,
      correlationId: row.metadata?.correlationId ?? null,
      metadata: {
        ...payload,
        ...content,
      },
    };
  }
  return {
    id: row.id,
    conversationRef: row.conversationRef,
    turnRef: row.turnRef,
    revisionId,
    timestamp,
    sender: row.role,
    text: displayTextFromRowContent(row.content),
    messageType: row.type === 'assistant_message' && row.isStreaming ? 'assistant_delta' : row.type,
    metadata: payload,
  };
}

export function buildChatMessagesFromSdkDisplayRows(rows: SdkDisplayRow[]): ChatMessage[] {
  return rows.flatMap((row) => {
    const message = displayMessageFromSdkDisplayRow(row);
    if (!message) {
      return [];
    }
    return buildChatMessagesFromDisplayMessage(message);
  });
}
