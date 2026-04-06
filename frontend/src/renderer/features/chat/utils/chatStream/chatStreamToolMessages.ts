import type {
  ToolBundleEvent,
  ToolCallEvent,
  ToolOutputEvent,
} from '../../../../types/backendEvents';
import type { ChatMessage } from '../../stores/chatStore';
import { resolveToolOutputCorrelationId } from './chatStreamEventUtils';
import { buildToolOutputMessageState } from '../toolOutputMessageState';

type TranscriptModelContext = {
  modelId: string | null;
  modelProvider: string | null;
};

export function buildToolCallMessage(
  event: ToolCallEvent,
  messageState: Pick<ChatMessage, 'text' | 'toolCallDisplayText' | 'modelFacingToolCall' | 'toolCallDetails' | 'correlationId'>,
  modelContext: TranscriptModelContext,
): ChatMessage {
  return {
    id: crypto.randomUUID(),
    text: messageState.text,
    toolCallDisplayText: messageState.toolCallDisplayText,
    sender: 'assistant',
    type: 'tool-call',
    sourceEventType: 'tool-call',
    sourceChannel: 'from-backend',
    modelFacingToolCall: messageState.modelFacingToolCall ?? null,
    toolCallDetails: messageState.toolCallDetails ?? null,
    correlationId: messageState.correlationId ?? undefined,
    turnRef: event.turn_ref,
    modelId: modelContext.modelId,
    modelProvider: modelContext.modelProvider,
  };
}

export function buildToolBundleMessage(
  event: ToolBundleEvent,
  messageState: Pick<ChatMessage, 'text' | 'toolCallDisplayText' | 'toolCallDetails' | 'correlationId'>,
  modelContext: TranscriptModelContext,
): ChatMessage {
  return {
    id: crypto.randomUUID(),
    text: messageState.text,
    toolCallDisplayText: messageState.toolCallDisplayText,
    sender: 'assistant',
    type: 'tool-call',
    sourceEventType: 'tool-bundle',
    sourceChannel: 'from-backend',
    toolCallDetails: messageState.toolCallDetails ?? null,
    correlationId: messageState.correlationId ?? undefined,
    turnRef: event.turn_ref,
    modelId: modelContext.modelId,
    modelProvider: modelContext.modelProvider,
  };
}

export function buildToolOutputMessage(
  event: ToolOutputEvent,
  outputText: string,
  modelContext: TranscriptModelContext,
  screenshot: string | null,
  screenshotRef: string | null,
  screenshotUrl: string | null,
): ChatMessage {
  return buildToolOutputMessageState({
    outputText,
    sourceEventType: 'tool-output',
    sourceChannel: 'from-backend',
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
    modelId: modelContext.modelId,
    modelProvider: modelContext.modelProvider,
  });
}
