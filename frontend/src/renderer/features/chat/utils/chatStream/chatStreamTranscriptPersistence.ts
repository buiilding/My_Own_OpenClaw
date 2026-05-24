import { DesktopTranscriptProjectionRuntimeClient } from '../../../../app/runtime/desktopTranscriptProjectionRuntimeClient';
import type {
  TranscriptStructuredToolPayload,
  TranscriptTransparencyData,
} from '../../../../infrastructure/transcript/types';
import type { TranscriptModelContext } from '../transcriptModelContext';

type AssistantTranscriptOptions = {
  text: string;
  messageType?: string;
  conversationRef?: string | null;
  userId?: string | null;
  modelContext: TranscriptModelContext;
  transparency?: TranscriptTransparencyData | null;
};

type ToolTranscriptOptions = {
  text: string;
  messageType: string;
  toolName?: string | null;
  correlationId?: string | null;
  screenshotRef?: string | null;
  conversationRef?: string | null;
  userId?: string | null;
  modelContext: TranscriptModelContext;
  structuredPayload?: TranscriptStructuredToolPayload | null;
};

export function recordAssistantTranscriptMessage({
  text,
  messageType = 'llm-text',
  conversationRef = null,
  userId = null,
  modelContext,
  transparency = null,
}: AssistantTranscriptOptions): void {
  DesktopTranscriptProjectionRuntimeClient.recordAssistantMessage(text, {
    messageType,
    conversationRef: conversationRef || undefined,
    userId: userId || undefined,
    modelId: modelContext.modelId,
    modelProvider: modelContext.modelProvider,
    transparency,
  });
}

export function recordToolTranscriptMessage({
  text,
  messageType,
  toolName = null,
  correlationId = null,
  screenshotRef = null,
  conversationRef = null,
  userId = null,
  modelContext,
  structuredPayload = null,
}: ToolTranscriptOptions): void {
  DesktopTranscriptProjectionRuntimeClient.recordToolMessage(text, {
    messageType,
    toolName: toolName || undefined,
    correlationId: correlationId || undefined,
    conversationRef: conversationRef || undefined,
    userId: userId || undefined,
    screenshotRef: screenshotRef || undefined,
    modelId: modelContext.modelId,
    modelProvider: modelContext.modelProvider,
    structuredPayload,
  });
}
