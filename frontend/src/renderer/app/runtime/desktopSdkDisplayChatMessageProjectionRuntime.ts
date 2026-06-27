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

function rowTurnRef(row: SdkDisplayRow): string | null {
  return exactNonEmptyString(row.turnRef);
}

function rowToolName(row: SdkDisplayRow): string | null {
  return exactNonEmptyString(row.metadata?.toolName);
}

function isSdkDisplayRowStreaming(row: SdkDisplayRow): boolean {
  return 'isStreaming' in row && row.isStreaming === true;
}

function withRowActions(message: ChatMessage, row: SdkDisplayRow): ChatMessage {
  return row.actions ? { ...message, actions: row.actions } : message;
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
  const text = displayTextFromStructuredRowContent(row.content);
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
    outputText: row.type === 'tool_bundle_output'
      ? displayTextFromStructuredRowContent(row.content)
      : displayTextFromStringRowContent(row.content),
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
    type: 'search-source',
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
