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

type SdkDisplayRowRole = SdkDisplayRow['role'];
type SdkDisplayRowType = SdkDisplayRow['type'];
type DisplayRowKind =
  | 'assistant'
  | 'ignored'
  | 'tool-call'
  | 'tool-output'
  | 'tool-progress'
  | 'user';

const SDK_DISPLAY_ROW_ROLES = new Set<SdkDisplayRowRole>([
  'assistant',
  'tool',
  'user',
]);
const SDK_DISPLAY_ROW_TYPES = new Set<SdkDisplayRowType>([
  'assistant_message',
  'error',
  'reasoning',
  'tool_bundle_call',
  'tool_bundle_output',
  'tool_call',
  'tool_output',
  'tool_progress',
  'user_message',
]);

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

function readExactDisplayRowRole(value: unknown): SdkDisplayRowRole | null {
  return typeof value === 'string'
    && value.length > 0
    && value === value.trim()
    && SDK_DISPLAY_ROW_ROLES.has(value as SdkDisplayRowRole)
    ? value as SdkDisplayRowRole
    : null;
}

function readExactDisplayRowType(value: unknown): SdkDisplayRowType | null {
  return typeof value === 'string'
    && value.length > 0
    && value === value.trim()
    && SDK_DISPLAY_ROW_TYPES.has(value as SdkDisplayRowType)
    ? value as SdkDisplayRowType
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

function resolveDisplayRowKind(row: SdkDisplayRow): DisplayRowKind | null {
  const role = readExactDisplayRowRole(row.role);
  const type = readExactDisplayRowType(row.type);
  if (!role || !type) {
    return null;
  }
  if (type === 'reasoning' || type === 'error') {
    return 'ignored';
  }
  if (role === 'user' && type === 'user_message') {
    return 'user';
  }
  if (role === 'assistant' && type === 'assistant_message') {
    return 'assistant';
  }
  if (role === 'assistant' && (type === 'tool_call' || type === 'tool_bundle_call')) {
    return 'tool-call';
  }
  if (role === 'tool' && (type === 'tool_output' || type === 'tool_bundle_output')) {
    return 'tool-output';
  }
  if (role === 'assistant' && type === 'tool_progress') {
    return 'tool-progress';
  }
  return null;
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
  if (actionRecord.canEdit === true && editTargetRowId) {
    actions.canEdit = true;
    actions.editTargetRowId = editTargetRowId;
  }
  if (actionRecord.canRetry === true && retryTargetRowId) {
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
  const rowKind = resolveDisplayRowKind(row);
  if (!rowKind || rowKind === 'ignored') {
    return [];
  }
  if (rowKind === 'user') {
    return [buildUserChatMessage(row)];
  }
  if (rowKind === 'tool-call') {
    return [buildToolCallMessage(row)];
  }
  if (rowKind === 'tool-output') {
    return [buildToolOutputMessage(row)];
  }
  if (rowKind === 'tool-progress') {
    return [buildToolProgressMessage(row)];
  }
  if (rowKind === 'assistant') {
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
