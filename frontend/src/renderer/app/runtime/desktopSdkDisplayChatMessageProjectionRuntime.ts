/**
 * Projects sdk display chat message state for the renderer UI.
 */

import type { ChatMessage } from './desktopChatMessageTypes';
import type {
  SdkDisplayRow,
} from '../../../../../packages/windie-sdk-js/src/conversation/types.js';
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

function rowTimestamp(row: SdkDisplayRow): string | null {
  return exactNonEmptyString(row.metadata?.timestamp);
}

function rowTimestampProp(row: SdkDisplayRow): Pick<ChatMessage, 'timestamp'> | Record<string, never> {
  const timestamp = rowTimestamp(row);
  return timestamp ? { timestamp } : {};
}

function rowSourceEventType(row: SdkDisplayRow): string | null {
  return exactNonEmptyString(row.metadata?.sourceEventType);
}

function rowSourceEventTypeProp(row: SdkDisplayRow): Pick<ChatMessage, 'sourceEventType'> | Record<string, never> {
  const sourceEventType = rowSourceEventType(row);
  return sourceEventType ? { sourceEventType } : {};
}

function exactNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 && value === value.trim()
    ? value
    : null;
}

function rowCorrelationId(row: SdkDisplayRow): string | null {
  return exactNonEmptyString(row.metadata?.displayCorrelationId);
}

function rowCorrelationIdProp(row: SdkDisplayRow): Pick<ChatMessage, 'correlationId'> | Record<string, never> {
  const correlationId = rowCorrelationId(row);
  return correlationId ? { correlationId } : {};
}

function rowId(row: SdkDisplayRow): string | null {
  return exactNonEmptyString(row.id);
}

function rowTurnRef(row: SdkDisplayRow): string | null {
  return exactNonEmptyString(row.turnRef);
}

function rowTurnRefProp(row: SdkDisplayRow): Pick<ChatMessage, 'turnRef'> | Record<string, never> {
  const turnRef = rowTurnRef(row);
  return turnRef ? { turnRef } : {};
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
    sourceChannel: sdkDisplayRowsSourceChannel,
    isComplete: true,
    ...rowSourceEventTypeProp(row),
    ...rowTurnRefProp(row),
    ...rowTimestampProp(row),
    ...(attachments.length > 0 ? { attachments } : {}),
  }, row);
}

function buildAssistantChatMessage(row: SdkDisplayRow): ChatMessage {
  const thinkingText = rowReasoningText(row);
  const turnRef = rowTurnRef(row);
  return withRowActions({
    id: row.id,
    text: displayTextFromStringRowContent(row.content),
    sender: 'assistant',
    type: 'llm-text',
    sourceChannel: sdkDisplayRowsSourceChannel,
    ...rowSourceEventTypeProp(row),
    ...(turnRef ? { turnRef } : {}),
    isComplete: !isSdkDisplayRowStreaming(row),
    ...(thinkingText ? {
      thinkingText,
      thinkingSourceEventType: 'reasoning_delta',
    } : {}),
    ...rowTimestampProp(row),
  }, row);
}

function buildToolCallMessage(row: SdkDisplayRow): ChatMessage {
  const text = displayTextFromStringRowContent(row.content);
  const toolCallDetails = sanitizeSdkToolDetailRecord(row.metadata?.toolCallDetails);
  const correlationId = rowCorrelationId(row);
  const turnRef = rowTurnRef(row);
  return withRowActions({
    id: row.id,
    text,
    sender: 'assistant',
    type: 'tool-call',
    sourceChannel: sdkDisplayRowsSourceChannel,
    isComplete: true,
    ...rowSourceEventTypeProp(row),
    ...(text ? { toolCallDisplayText: text } : {}),
    ...(toolCallDetails ? { toolCallDetails } : {}),
    ...(correlationId ? { correlationId } : {}),
    ...(turnRef ? { turnRef } : {}),
    ...rowTimestampProp(row),
  }, row);
}

function buildToolOutputMessage(row: SdkDisplayRow): ChatMessage {
  const attachments = readSdkDisplayAttachments(row.metadata?.attachments);
  const toolOutputDetails = sanitizeSdkToolDetailRecord(row.metadata?.toolOutputDetails);
  const text = displayTextFromStringRowContent(row.content);
  const correlationId = rowCorrelationId(row);
  const turnRef = rowTurnRef(row);
  return withRowActions({
    id: row.id,
    text,
    sender: 'assistant',
    type: 'tool-output',
    sourceChannel: sdkDisplayRowsSourceChannel,
    isComplete: true,
    ...rowSourceEventTypeProp(row),
    ...(toolOutputDetails ? { toolOutputDetails } : {}),
    ...(attachments.length > 0 ? { attachments } : {}),
    ...(correlationId ? { correlationId } : {}),
    ...(turnRef ? { turnRef } : {}),
    ...rowTimestampProp(row),
  }, row);
}

function buildToolProgressMessage(row: SdkDisplayRow): ChatMessage {
  const toolCallDetails = sanitizeSdkToolDetailRecord(row.metadata?.toolCallDetails);
  return withRowActions({
    id: row.id,
    text: displayTextFromStringRowContent(row.content),
    sender: 'assistant',
    type: 'tool-progress',
    sourceChannel: sdkDisplayRowsSourceChannel,
    ...rowSourceEventTypeProp(row),
    ...rowTurnRefProp(row),
    ...rowCorrelationIdProp(row),
    ...rowTimestampProp(row),
    ...(toolCallDetails ? { toolCallDetails } : {}),
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
