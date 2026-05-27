import { DesktopTranscriptProjectionRuntimeClient } from '../../../../app/runtime/desktopTranscriptProjectionRuntimeClient';

type RecordUserTranscriptMessageOptions = {
  messageId?: string | null;
  text: string;
  conversationRef: string;
  userId?: string | null;
  timestamp?: string | null;
  screenshotRef?: string | null;
};

export function recordUserTranscriptMessage({
  messageId = null,
  text,
  conversationRef,
  userId = null,
  timestamp = null,
  screenshotRef = null,
}: RecordUserTranscriptMessageOptions): void {
  DesktopTranscriptProjectionRuntimeClient.recordUserMessage(text, {
    messageId,
    conversationRef,
    userId,
    timestamp: timestamp ?? undefined,
    screenshotRef,
  });
}
