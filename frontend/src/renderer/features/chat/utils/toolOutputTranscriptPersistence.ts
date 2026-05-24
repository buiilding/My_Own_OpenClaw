import { buildStructuredToolPayload } from '../../../infrastructure/transcript/structuredToolPayload';
import { recordToolTranscriptMessage } from './chatStream/chatStreamTranscriptPersistence';
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
  recordToolTranscriptMessage({
    text,
    messageType: 'tool-output',
    toolName,
    correlationId,
    conversationRef,
    userId,
    screenshotRef,
    modelContext,
    structuredPayload: buildStructuredToolPayload({
      kind: 'tool-output',
      toolCallDetails: toolOutputDetails,
    }),
  });
}
