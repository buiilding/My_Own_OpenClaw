/**
 * Projects sdk display chat message state for the renderer UI.
 */

import type { ChatMessage } from '../../app/runtime/desktopChatMessageTypes';
import type {
  SdkDisplayRow,
  SdkDisplayAttachment,
  DisplayMessage,
} from '../../../../../packages/windie-sdk-js/src/conversation/types.js';
import { buildAssistantTextChatMessageState } from './assistantTextChatMessageState';
import { buildToolCallChatMessageState } from './toolCallChatMessageState';
import { buildToolOutputChatMessageState } from './toolOutputChatMessageState';
import { DesktopPresentationSourceChannels } from '../../app/runtime/desktopPresentationSourceChannels';

const sdkDisplayRowsSourceChannel = DesktopPresentationSourceChannels.getSdkDisplayRowsSourceChannel();

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
    'attachments',
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

function displayAttachmentsFromPayload(payload: Record<string, unknown>): SdkDisplayAttachment[] {
  const value = recordField(payload, 'attachments');
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry): entry is SdkDisplayAttachment => {
    const record = recordFromPayloadValue(entry);
    return Boolean(
      record
      && typeof record.id === 'string'
      && (record.kind === 'image' || record.kind === 'screenshot_request')
      && (
        record.source === 'user_included'
        || record.source === 'camera_button'
        || record.source === 'tool_result'
        || record.source === 'replay'
      )
      && (
        record.status === 'materializing'
        || record.status === 'pending_capture'
        || record.status === 'ready'
        || record.status === 'failed'
      ),
    );
  });
}

function recordFromPayloadValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function buildUserChatMessage(message: DisplayMessage): ChatMessage {
  const payload = recordPayload(message);
  const attachments = displayAttachmentsFromPayload(payload);
  return {
    id: message.id,
    text: message.text,
    sender: 'user',
    turnRef: message.turnRef ?? null,
    sourceEventType: message.messageType,
    sourceChannel: sdkDisplayRowsSourceChannel,
    timestamp: message.timestamp,
    isComplete: true,
    ...(attachments.length > 0 ? { attachments } : {}),
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
  const attachments = displayAttachmentsFromPayload(payload);
  const base = buildToolOutputChatMessageState({
    id: message.id,
    outputText: message.text,
    sourceEventType: message.messageType,
    attachments,
    toolName: message.toolName ?? null,
    success: typeof payload.success === 'boolean' ? payload.success : null,
    correlationId: message.requestId ?? message.bundleId ?? message.toolCallId ?? message.correlationId ?? null,
    toolOutputDetails: payload,
    turnRef: message.turnRef ?? null,
    isComplete: true,
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
    sourceChannel: sdkDisplayRowsSourceChannel,
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
