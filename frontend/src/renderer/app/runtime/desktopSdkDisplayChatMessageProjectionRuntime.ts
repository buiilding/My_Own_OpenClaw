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
import { DesktopSdkToolDetailProjection } from './desktopSdkToolDetailProjection';

const sdkDisplayRowsSourceChannel = DesktopPresentationSourceChannels.getSdkDisplayRowsSourceChannel();
const {
  readSdkDisplayAttachments,
} = DesktopSdkDisplayAttachmentProjection;
const {
  sanitizeSdkToolDetailRecord,
} = DesktopSdkToolDetailProjection;

function displayTextFromStringRowContent(content: unknown): string {
  return typeof content === 'string' ? content : '';
}

function rowTimestamp(row: SdkDisplayRow): string {
  return exactNonEmptyString(row.metadata?.timestamp) ?? '';
}

function rowSourceEventType(row: SdkDisplayRow): string {
  const sourceEventType = row.metadata?.sourceEventType;
  if (
    typeof sourceEventType === 'string'
    && sourceEventType.length > 0
    && sourceEventType === sourceEventType.trim()
  ) {
    return sourceEventType;
  }
  return row.type;
}

function exactNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 && value === value.trim()
    ? value
    : null;
}

function rowCorrelationId(row: SdkDisplayRow): string | null {
  return exactNonEmptyString(row.metadata?.displayCorrelationId);
}

function rowId(row: SdkDisplayRow): string | null {
  return exactNonEmptyString(row.id);
}

function rowTurnRef(row: SdkDisplayRow): string | null {
  return exactNonEmptyString(row.turnRef);
}

function rowToolName(row: SdkDisplayRow): string | null {
  return exactNonEmptyString(row.metadata?.toolName);
}

function rowReasoningText(row: SdkDisplayRow): string | null {
  return exactNonEmptyString(row.metadata?.reasoningText);
}

function isSdkDisplayRowStreaming(row: SdkDisplayRow): boolean {
  return 'isStreaming' in row && row.isStreaming === true;
}

function isUserDisplayRow(row: SdkDisplayRow): boolean {
  return row.type === 'user_message' && row.role === 'user';
}

function isAssistantDisplayRow(row: SdkDisplayRow): boolean {
  return row.type === 'assistant_message' && row.role === 'assistant';
}

function isToolCallDisplayRow(row: SdkDisplayRow): boolean {
  return (row.type === 'tool_call' || row.type === 'tool_bundle_call') && row.role === 'assistant';
}

function isToolOutputDisplayRow(row: SdkDisplayRow): boolean {
  return (row.type === 'tool_output' || row.type === 'tool_bundle_output') && row.role === 'tool';
}

function isToolProgressDisplayRow(row: SdkDisplayRow): boolean {
  return row.type === 'tool_progress' && row.role === 'assistant';
}

function rowReplayActions(row: SdkDisplayRow): ChatMessage['actions'] | null {
  const source = row.actions;
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    return null;
  }
  const actionRecord = source as Record<string, unknown>;
  const actions: NonNullable<ChatMessage['actions']> = {};
  const editTargetRowId = exactNonEmptyString(actionRecord.editTargetRowId);
  const retryTargetRowId = exactNonEmptyString(actionRecord.retryTargetRowId);
  if (isUserDisplayRow(row) && actionRecord.canEdit === true && editTargetRowId) {
    actions.canEdit = true;
    actions.editTargetRowId = editTargetRowId;
  }
  if (isAssistantDisplayRow(row) && actionRecord.canRetry === true && retryTargetRowId) {
    actions.canRetry = true;
    actions.retryTargetRowId = retryTargetRowId;
  }
  return Object.keys(actions).length > 0 ? actions : null;
}

function withRowActions(message: ChatMessage, row: SdkDisplayRow): ChatMessage {
  const actions = rowReplayActions(row);
  return actions ? { ...message, actions } : message;
}

function buildUserChatMessage(row: SdkDisplayRow): ChatMessage {
  const attachments = readSdkDisplayAttachments(row.metadata?.attachments);
  return withRowActions({
    id: row.id,
    text: displayTextFromStringRowContent(row.content),
    sender: 'user',
    turnRef: rowTurnRef(row),
    sourceEventType: rowSourceEventType(row),
    sourceChannel: sdkDisplayRowsSourceChannel,
    timestamp: rowTimestamp(row),
    isComplete: true,
    ...(attachments.length > 0 ? { attachments } : {}),
  }, row);
}

function buildAssistantChatMessage(row: SdkDisplayRow): ChatMessage {
  const thinkingText = rowReasoningText(row);
  const sourceEventType = rowSourceEventType(row);
  const base = buildAssistantTextChatMessageState({
    id: row.id,
    text: displayTextFromStringRowContent(row.content),
    sourceEventType,
    sourceChannel: sdkDisplayRowsSourceChannel,
    turnRef: rowTurnRef(row),
    isComplete: !isSdkDisplayRowStreaming(row),
    thinkingText,
    thinkingSourceEventType: thinkingText ? 'reasoning_delta' : null,
  }) as ChatMessage;
  return withRowActions({
    ...base,
    timestamp: rowTimestamp(row),
  }, row);
}

function buildToolCallMessage(row: SdkDisplayRow): ChatMessage {
  const text = displayTextFromStringRowContent(row.content);
  const toolCallDetails = sanitizeSdkToolDetailRecord(row.metadata?.toolCallDetails);
  const base = buildToolCallChatMessageState({
    id: row.id,
    text,
    toolCallDisplayText: text,
    toolCallDetails,
    correlationId: rowCorrelationId(row),
    sourceEventType: rowSourceEventType(row),
    sourceChannel: sdkDisplayRowsSourceChannel,
    turnRef: rowTurnRef(row),
    isComplete: true,
  }) as ChatMessage;
  return withRowActions({
    ...base,
    timestamp: rowTimestamp(row),
  }, row);
}

function buildToolOutputMessage(row: SdkDisplayRow): ChatMessage {
  const attachments = readSdkDisplayAttachments(row.metadata?.attachments);
  const toolOutputDetails = sanitizeSdkToolDetailRecord(row.metadata?.toolOutputDetails);
  const base = buildToolOutputChatMessageState({
    id: row.id,
    outputText: displayTextFromStringRowContent(row.content),
    sourceEventType: rowSourceEventType(row),
    sourceChannel: sdkDisplayRowsSourceChannel,
    attachments,
    toolName: rowToolName(row),
    success: typeof row.metadata?.success === 'boolean' ? row.metadata.success : null,
    correlationId: rowCorrelationId(row),
    toolOutputDetails,
    turnRef: rowTurnRef(row),
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
  const toolMetadata = sanitizeSdkToolDetailRecord(
    row.metadata?.toolCallDetails ?? row.metadata?.toolOutputDetails,
  );
  return withRowActions({
    id: row.id,
    text: displayTextFromStringRowContent(row.content),
    sender: 'assistant',
    type: 'tool-progress',
    sourceEventType: rowSourceEventType(row),
    sourceChannel: sdkDisplayRowsSourceChannel,
    turnRef: rowTurnRef(row) ?? undefined,
    timestamp: rowTimestamp(row),
    toolName: rowToolName(row) ?? undefined,
    toolMetadata,
    correlationId: rowCorrelationId(row) ?? undefined,
  }, row);
}

function buildChatMessagesFromSdkDisplayRow(row: SdkDisplayRow): ChatMessage[] {
  if (!rowId(row)) {
    return [];
  }
  if (row.type === 'reasoning' || row.type === 'error') {
    return [];
  }
  if (isUserDisplayRow(row)) {
    return [buildUserChatMessage(row)];
  }
  if (isToolCallDisplayRow(row)) {
    return [buildToolCallMessage(row)];
  }
  if (isToolOutputDisplayRow(row)) {
    return [buildToolOutputMessage(row)];
  }
  if (isToolProgressDisplayRow(row)) {
    return [buildToolProgressMessage(row)];
  }
  if (isAssistantDisplayRow(row)) {
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
