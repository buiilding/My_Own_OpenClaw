/**
 * Projects sdk display chat message state for the renderer UI.
 */

import type { ChatMessage } from '../../app/runtime/desktopChatMessageTypes';
import type {
  SdkDisplayRow,
} from '../../../../../packages/windie-sdk-js/src/conversation/types.js';
import { buildAssistantTextChatMessageState } from './assistantTextChatMessageState';
import { buildToolCallChatMessageState } from './toolCallChatMessageState';
import { buildToolOutputChatMessageState } from './toolOutputChatMessageState';
import { DesktopPresentationSourceChannels } from '../../app/runtime/desktopPresentationSourceChannels';
import { DesktopSdkDisplayAttachmentProjection } from '../../app/runtime/desktopSdkDisplayAttachmentProjection';

const sdkDisplayRowsSourceChannel = DesktopPresentationSourceChannels.getSdkDisplayRowsSourceChannel();
const {
  readSdkDisplayAttachments,
} = DesktopSdkDisplayAttachmentProjection;

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

function recordFromPayloadValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function rowTimestamp(row: SdkDisplayRow): string {
  return typeof row.metadata?.timestamp === 'string' ? row.metadata.timestamp : '';
}

function rowSourceEventType(row: SdkDisplayRow): string {
  return row.type === 'assistant_message' && row.isStreaming ? 'assistant_delta' : row.type;
}

function rowCorrelationId(row: SdkDisplayRow): string | null {
  return row.metadata?.requestId
    ?? row.metadata?.bundleId
    ?? row.metadata?.toolCallId
    ?? row.metadata?.correlationId
    ?? null;
}

function buildUserChatMessage(row: SdkDisplayRow): ChatMessage {
  const payload = recordPayloadFromRow(row);
  const attachments = readSdkDisplayAttachments(recordField(payload, 'attachments'));
  return {
    id: row.id,
    text: displayTextFromRowContent(row.content),
    sender: 'user',
    turnRef: row.turnRef ?? null,
    sourceEventType: rowSourceEventType(row),
    sourceChannel: sdkDisplayRowsSourceChannel,
    timestamp: rowTimestamp(row),
    isComplete: true,
    ...(attachments.length > 0 ? { attachments } : {}),
  };
}

function buildAssistantChatMessage(row: SdkDisplayRow): ChatMessage {
  const payload = recordPayloadFromRow(row);
  const thinkingText = stringField(payload, 'reasoningText', 'reasoning_text');
  const sourceEventType = rowSourceEventType(row);
  const base = buildAssistantTextChatMessageState({
    id: row.id,
    text: displayTextFromRowContent(row.content),
    sourceEventType,
    turnRef: row.turnRef ?? null,
    isComplete: sourceEventType !== 'assistant_delta',
    thinkingText,
    thinkingSourceEventType: thinkingText ? 'reasoning_delta' : null,
  }) as ChatMessage;
  return {
    ...base,
    timestamp: rowTimestamp(row),
  };
}

function buildToolCallMessage(row: SdkDisplayRow): ChatMessage {
  const payload = recordPayloadFromRow(row);
  const toolCall = recordFromPayloadValue(recordField(payload, 'modelFacingToolCall'));
  const args = recordFromPayloadValue(recordField(payload, 'args'));
  const bundleToolCallPayload = row.type === 'tool_bundle_call'
    ? payload
    : null;
  const fallbackToolCall = bundleToolCallPayload ?? toolCall ?? (
    row.metadata?.toolName
      ? {
        id: row.metadata.toolCallId ?? row.metadata.correlationId ?? undefined,
        name: row.metadata.toolName,
        arguments: args ?? undefined,
      }
      : null
  );
  const text = displayTextFromRowContent(row.content);
  const base = buildToolCallChatMessageState({
    id: row.id,
    text,
    toolCallDisplayText: text,
    modelFacingToolCall: fallbackToolCall,
    toolCallDetails: payload,
    correlationId: rowCorrelationId(row),
    sourceEventType: rowSourceEventType(row),
    turnRef: row.turnRef ?? null,
    isComplete: true,
  }) as ChatMessage;
  return {
    ...base,
    timestamp: rowTimestamp(row),
  };
}

function buildToolOutputMessage(row: SdkDisplayRow): ChatMessage {
  const payload = recordPayloadFromRow(row);
  const attachments = readSdkDisplayAttachments(recordField(payload, 'attachments'));
  const base = buildToolOutputChatMessageState({
    id: row.id,
    outputText: displayTextFromRowContent(row.content),
    sourceEventType: rowSourceEventType(row),
    attachments,
    toolName: row.metadata?.toolName ?? null,
    success: typeof payload.success === 'boolean' ? payload.success : null,
    correlationId: rowCorrelationId(row),
    toolOutputDetails: payload,
    turnRef: row.turnRef ?? null,
    isComplete: true,
    preserveNullToolMetadata: false,
    preserveNullToolOutputDetails: false,
  }) as ChatMessage;
  return {
    ...base,
    timestamp: rowTimestamp(row),
  };
}

function buildToolProgressMessage(row: SdkDisplayRow): ChatMessage {
  const payload = recordPayloadFromRow(row);
  const sourceEventType = recordField(payload, 'sourceEventType');
  return {
    id: row.id,
    text: displayTextFromRowContent(row.content),
    sender: 'assistant',
    type: 'search-source',
    sourceEventType: typeof sourceEventType === 'string' && sourceEventType.trim()
      ? sourceEventType
      : 'web-search-progress',
    sourceChannel: sdkDisplayRowsSourceChannel,
    turnRef: row.turnRef ?? undefined,
    timestamp: rowTimestamp(row),
    toolName: row.metadata?.toolName ?? undefined,
    toolMetadata: payload,
    correlationId: row.metadata?.requestId ?? row.metadata?.correlationId ?? undefined,
  };
}

function buildChatMessagesFromSdkDisplayRow(row: SdkDisplayRow): ChatMessage[] {
  if (row.type === 'reasoning' || row.type === 'error') {
    return [];
  }
  if (row.type === 'user_message') {
    return [buildUserChatMessage(row)];
  }
  if (row.type === 'tool_call' || row.type === 'tool_bundle_call') {
    return [buildToolCallMessage(row)];
  }
  if (row.type === 'tool_output' || row.type === 'tool_bundle_output') {
    return [buildToolOutputMessage(row)];
  }
  if (row.type === 'tool_progress') {
    return [buildToolProgressMessage(row)];
  }
  if (row.type === 'assistant_message') {
    return [buildAssistantChatMessage(row)];
  }
  return [];
}

export function buildChatMessagesFromSdkDisplayRows(rows: SdkDisplayRow[]): ChatMessage[] {
  return rows.flatMap((row) => buildChatMessagesFromSdkDisplayRow(row));
}
