import { buildStructuredToolPayload } from '../../../infrastructure/transcript/structuredToolPayload';
import { DesktopConversationRuntimeClient } from '../session/desktopConversationRuntimeClient';
import type { TranscriptModelContext } from './transcriptModelContext';

type RecordToolOutputTranscriptMessageOptions = {
  text: string;
  toolName?: string | null;
  correlationId?: string | null;
  screenshotRef?: string | null;
  conversationRef?: string | null;
  userId?: string | null;
  modelContext: TranscriptModelContext;
  toolOutputDetails?: Record<string, unknown> | null;
};

export function recordToolOutputTranscriptMessage({
  text,
  toolName = null,
  correlationId = null,
  screenshotRef = null,
  conversationRef = null,
  userId = null,
  modelContext,
  toolOutputDetails = null,
}: RecordToolOutputTranscriptMessageOptions): void {
  DesktopConversationRuntimeClient.recordToolMessage(text, {
    messageType: 'tool-output',
    toolName: toolName || undefined,
    correlationId: correlationId || undefined,
    conversationRef: conversationRef || undefined,
    userId: userId || undefined,
    screenshotRef: screenshotRef || undefined,
    modelId: modelContext.modelId,
    modelProvider: modelContext.modelProvider,
    structuredPayload: buildStructuredToolPayload({
      kind: 'tool-output',
      toolCallDetails: toolOutputDetails,
    }),
  });
}
