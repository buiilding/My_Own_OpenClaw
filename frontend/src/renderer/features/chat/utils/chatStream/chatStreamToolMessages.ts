import type {
  ToolBundleEvent,
  ToolCallEvent,
  ToolOutputEvent,
} from '../../../../types/backendEvents';
import type { ChatMessage } from '../../stores/chatStore';
import { resolveToolOutputCorrelationId } from './chatStreamEventUtils';

type TranscriptModelContext = {
  modelId: string | null;
  modelProvider: string | null;
};

function cloneToolPayload(payload: unknown): Record<string, unknown> | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }
  return { ...payload };
}

export function buildToolCallMessage(
  event: ToolCallEvent,
  formattedText: string,
  modelContext: TranscriptModelContext,
  modelFacingToolCall: unknown,
): ChatMessage {
  return {
    id: crypto.randomUUID(),
    text: formattedText,
    sender: 'assistant',
    type: 'tool-call',
    sourceEventType: 'tool-call',
    sourceChannel: 'from-backend',
    modelFacingToolCall,
    toolCallDetails: cloneToolPayload(event.payload),
    turnRef: event.turn_ref,
    modelId: modelContext.modelId,
    modelProvider: modelContext.modelProvider,
  };
}

export function buildToolBundleMessage(
  event: ToolBundleEvent,
  formattedText: string,
  modelContext: TranscriptModelContext,
): ChatMessage {
  return {
    id: crypto.randomUUID(),
    text: formattedText,
    sender: 'assistant',
    type: 'tool-call',
    sourceEventType: 'tool-bundle',
    sourceChannel: 'from-backend',
    toolCallDetails: cloneToolPayload(event.payload),
    turnRef: event.turn_ref,
    modelId: modelContext.modelId,
    modelProvider: modelContext.modelProvider,
  };
}

export function buildToolOutputMessage(
  event: ToolOutputEvent,
  outputText: string,
  modelContext: TranscriptModelContext,
  screenshotRef: string | null,
  screenshotUrl: string | null,
): ChatMessage {
  return {
    id: crypto.randomUUID(),
    text: outputText,
    sender: 'assistant',
    type: 'tool-output',
    sourceEventType: 'tool-output',
    sourceChannel: 'from-backend',
    screenshotRef,
    screenshotUrl,
    toolMetadata: event.payload?.metadata,
    toolName: event.payload?.tool_name,
    executionTime: event.payload?.execution_time,
    success: event.payload?.success,
    correlationId: resolveToolOutputCorrelationId(event.payload, event.id),
    modelFacingToolOutput: outputText,
    toolOutputDetails: cloneToolPayload(event.payload),
    turnRef: event.turn_ref,
    modelId: modelContext.modelId,
    modelProvider: modelContext.modelProvider,
  };
}
