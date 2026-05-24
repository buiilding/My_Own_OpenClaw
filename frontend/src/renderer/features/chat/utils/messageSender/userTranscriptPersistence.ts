import { DesktopTranscriptProjectionRuntimeClient } from '../../../../app/runtime/desktopTranscriptProjectionRuntimeClient';

type RecordUserTranscriptMessageOptions = {
  text: string;
  conversationRef: string;
  userId?: string | null;
  timestamp?: string | null;
  screenshotRef?: string | null;
};

export function recordUserTranscriptMessage({
  text,
  conversationRef,
  userId = null,
  timestamp = null,
  screenshotRef = null,
}: RecordUserTranscriptMessageOptions): void {
  DesktopTranscriptProjectionRuntimeClient.recordUserMessage(text, {
    conversationRef,
    userId,
    timestamp: timestamp ?? undefined,
    screenshotRef,
  });
}
