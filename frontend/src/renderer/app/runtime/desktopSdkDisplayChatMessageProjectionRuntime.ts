/**
 * Projects sdk display chat message state for the renderer UI.
 */

import type { ChatMessage } from './desktopChatMessageTypes';
import type {
  SdkDisplayRow,
} from '../../../../../packages/windie-sdk-js/src/conversation/types.js';
import { buildAssistantTextChatMessageState } from '../../infrastructure/transcript/assistantTextChatMessageState';
import { buildToolCallChatMessageState } from '../../infrastructure/transcript/toolCallChatMessageState';
import { buildToolOutputChatMessageState } from '../../infrastructure/transcript/toolOutputChatMessageState';
import { DesktopPresentationSourceChannels } from './desktopPresentationSourceChannels';
import { DesktopSdkDisplayAttachmentProjection } from './desktopSdkDisplayAttachmentProjection';

const sdkDisplayRowsSourceChannel = DesktopPresentationSourceChannels.getSdkDisplayRowsSourceChannel();
const {
  readSdkDisplayAttachments,
} = DesktopSdkDisplayAttachmentProjection;

function recordFromUnknown(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function optionalTrimmedString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function displayTextFromStringRowContent(content: unknown): string {
  return typeof content === 'string' ? content : '';
}

function displayTextFromStructuredRowContent(content: unknown): string {
  if (typeof content === 'string') {
    return content;
  }
  return JSON.stringify(content, null, 2) ?? '';
}

function rowTimestamp(row: SdkDisplayRow): string {
  return typeof row.metadata?.timestamp === 'string' ? row.metadata.timestamp : '';
}

function rowSourceEventType(row: SdkDisplayRow): string {
  return row.type === 'assistant_message' && row.isStreaming ? 'assistant_delta' : row.type;
}

function rowCorrelationId(row: SdkDisplayRow): string | null {
  return row.metadata?.displayCorrelationId ?? null;
}

function rowActions(row: SdkDisplayRow): ChatMessage['actions'] | undefined {
  const actions = row.actions;
  if (!actions || typeof actions !== 'object') {
    return undefined;
  }
  const projectedActions: NonNullable<ChatMessage['actions']> = {};
  if (typeof actions.canEdit === 'boolean') {
    projectedActions.canEdit = actions.canEdit;
  }
  const editTargetRowId = optionalTrimmedString(actions.editTargetRowId);
  if (editTargetRowId) {
    projectedActions.editTargetRowId = editTargetRowId;
  }
  if (typeof actions.canRetry === 'boolean') {
    projectedActions.canRetry = actions.canRetry;
  }
  const retryTargetRowId = optionalTrimmedString(actions.retryTargetRowId);
  if (retryTargetRowId) {
    projectedActions.retryTargetRowId = retryTargetRowId;
  }
  return Object.keys(projectedActions).length > 0 ? projectedActions : undefined;
}

function withRowActions(message: ChatMessage, row: SdkDisplayRow): ChatMessage {
  const actions = rowActions(row);
  return actions ? { ...message, actions } : message;
}

function buildUserChatMessage(row: SdkDisplayRow): ChatMessage {
  const attachments = readSdkDisplayAttachments(row.metadata?.attachments);
  return withRowActions({
    id: row.id,
    text: displayTextFromStringRowContent(row.content),
    sender: 'user',
    turnRef: row.turnRef ?? null,
    sourceEventType: rowSourceEventType(row),
    sourceChannel: sdkDisplayRowsSourceChannel,
    timestamp: rowTimestamp(row),
    isComplete: true,
    ...(attachments.length > 0 ? { attachments } : {}),
  }, row);
}

function buildAssistantChatMessage(row: SdkDisplayRow): ChatMessage {
  const reasoningText = row.metadata?.reasoningText;
  const thinkingText = typeof reasoningText === 'string' && reasoningText.trim()
    ? reasoningText
    : null;
  const sourceEventType = rowSourceEventType(row);
  const base = buildAssistantTextChatMessageState({
    id: row.id,
    text: displayTextFromStringRowContent(row.content),
    sourceEventType,
    sourceChannel: sdkDisplayRowsSourceChannel,
    turnRef: row.turnRef ?? null,
    isComplete: sourceEventType !== 'assistant_delta',
    thinkingText,
    thinkingSourceEventType: thinkingText ? 'reasoning_delta' : null,
  }) as ChatMessage;
  return withRowActions({
    ...base,
    timestamp: rowTimestamp(row),
  }, row);
}

function buildToolCallMessage(row: SdkDisplayRow): ChatMessage {
  const text = displayTextFromStructuredRowContent(row.content);
  const toolCallDetails = recordFromUnknown(row.metadata?.toolCallDetails);
  const base = buildToolCallChatMessageState({
    id: row.id,
    text,
    toolCallDisplayText: text,
    toolCallDetails,
    correlationId: rowCorrelationId(row),
    sourceEventType: rowSourceEventType(row),
    sourceChannel: sdkDisplayRowsSourceChannel,
    turnRef: row.turnRef ?? null,
    isComplete: true,
  }) as ChatMessage;
  return withRowActions({
    ...base,
    timestamp: rowTimestamp(row),
  }, row);
}

function buildToolOutputMessage(row: SdkDisplayRow): ChatMessage {
  const attachments = readSdkDisplayAttachments(row.metadata?.attachments);
  const toolOutputDetails = recordFromUnknown(row.metadata?.toolOutputDetails);
  const base = buildToolOutputChatMessageState({
    id: row.id,
    outputText: row.type === 'tool_bundle_output'
      ? displayTextFromStructuredRowContent(row.content)
      : displayTextFromStringRowContent(row.content),
    sourceEventType: rowSourceEventType(row),
    sourceChannel: sdkDisplayRowsSourceChannel,
    attachments,
    toolName: row.metadata?.toolName ?? null,
    success: typeof row.metadata?.success === 'boolean' ? row.metadata.success : null,
    correlationId: rowCorrelationId(row),
    toolOutputDetails,
    turnRef: row.turnRef ?? null,
    isComplete: true,
    preserveNullToolMetadata: false,
    preserveNullToolOutputDetails: false,
  }) as ChatMessage;
  return withRowActions({
    ...base,
    timestamp: rowTimestamp(row),
  }, row);
}

function buildToolProgressMessage(row: SdkDisplayRow): ChatMessage {
  const sourceEventType = row.metadata?.sourceEventType;
  return withRowActions({
    id: row.id,
    text: displayTextFromStringRowContent(row.content),
    sender: 'assistant',
    type: 'search-source',
    sourceEventType: typeof sourceEventType === 'string' && sourceEventType.trim()
      ? sourceEventType
      : 'web-search-progress',
    sourceChannel: sdkDisplayRowsSourceChannel,
    turnRef: row.turnRef ?? undefined,
    timestamp: rowTimestamp(row),
    toolName: row.metadata?.toolName ?? undefined,
    toolMetadata: recordFromUnknown(row.metadata?.toolCallDetails ?? row.metadata?.toolOutputDetails),
    correlationId: row.metadata?.displayCorrelationId ?? undefined,
  }, row);
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

function buildChatMessagesFromSdkDisplayRows(rows: SdkDisplayRow[]): ChatMessage[] {
  return rows.flatMap((row) => buildChatMessagesFromSdkDisplayRow(row));
}

export const DesktopSdkDisplayChatMessageProjectionRuntime = Object.freeze({
  buildChatMessagesFromSdkDisplayRows,
});
