import type {
  ToolBundleEvent,
  ToolCallEvent,
  ToolOutputEvent,
} from '../../../../types/backendEvents';
import type { ChatMessage } from '../../stores/chatStore';
import { resolveToolOutputCorrelationId } from './chatStreamEventUtils';
import { buildToolCallChatMessageState } from '../../../../infrastructure/transcript/toolCallChatMessageState';
import { buildToolOutputEnvelopeMessage, type TranscriptModelContext } from '../toolOutputMessages';

export function buildToolCallMessage(
  event: ToolCallEvent,
  messageState: Pick<ChatMessage, 'text' | 'toolCallDisplayText' | 'modelFacingToolCall' | 'toolCallDetails' | 'correlationId'>,
  modelContext: TranscriptModelContext,
): ChatMessage {
  return buildToolCallChatMessageState({
    text: messageState.text,
    toolCallDisplayText: messageState.toolCallDisplayText,
    modelFacingToolCall: messageState.modelFacingToolCall ?? null,
    toolCallDetails: messageState.toolCallDetails ?? null,
    correlationId: messageState.correlationId ?? null,
    sourceEventType: 'tool-call',
    sourceChannel: 'from-backend',
    turnRef: event.turn_ref,
    modelId: modelContext.modelId,
    modelProvider: modelContext.modelProvider,
  }) as ChatMessage;
}

export function buildToolBundleMessage(
  event: ToolBundleEvent,
  messageState: Pick<ChatMessage, 'text' | 'toolCallDisplayText' | 'toolCallDetails' | 'correlationId'>,
  modelContext: TranscriptModelContext,
): ChatMessage {
  return buildToolCallChatMessageState({
    text: messageState.text,
    toolCallDisplayText: messageState.toolCallDisplayText,
    toolCallDetails: messageState.toolCallDetails ?? null,
    correlationId: messageState.correlationId ?? null,
    sourceEventType: 'tool-bundle',
    sourceChannel: 'from-backend',
    turnRef: event.turn_ref,
    modelId: modelContext.modelId,
    modelProvider: modelContext.modelProvider,
  }) as ChatMessage;
}

export function buildToolOutputMessage(
  event: ToolOutputEvent,
  outputText: string,
  modelContext: TranscriptModelContext,
  screenshot: string | null,
  screenshotRef: string | null,
  screenshotUrl: string | null,
): ChatMessage {
  return buildToolOutputEnvelopeMessage({
    outputText,
    sourceEventType: 'tool-output' as const,
    sourceChannel: 'from-backend' as const,
    screenshot,
    screenshotRef,
    screenshotUrl,
    toolMetadata: event.payload?.metadata,
    toolName: event.payload?.tool_name,
    executionTime: event.payload?.execution_time,
    success: event.payload?.success,
    correlationId: resolveToolOutputCorrelationId(event.payload, event.id),
    toolOutputDetails: (
      event.payload && typeof event.payload === 'object'
        ? { ...event.payload }
        : null
    ),
    turnRef: event.turn_ref,
    modelContext,
  });
}
