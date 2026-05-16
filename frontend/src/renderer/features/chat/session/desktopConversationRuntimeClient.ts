import { ApiClient } from '../../../infrastructure/api/client';
import type { RehydrateConversationEntry } from '../../../infrastructure/api/client';
import type { CaptureMeta } from '../../../infrastructure/services/ScreenshotAttachmentPipeline';
import type { WindieModelSelection } from '../../../infrastructure/api/windieSdkClient';
import { recordUserMessage } from '../../../infrastructure/transcript/TranscriptWriter';

export type { RehydrateConversationEntry };

type SendConversationQueryInput = {
  text: string;
  conversationRef: string;
  screenshotRef?: string | null;
  screenshotUrl?: string | null;
  screenshotRefs?: string[] | null;
  captureMeta?: CaptureMeta | null;
  attachmentContext?: string | null;
  attachmentFilenames?: string[] | null;
  screenshot?: string | null;
  workspacePath?: string | null;
  transcript?: {
    userId?: string | null;
    timestamp?: string | null;
    screenshotRef?: string | null;
  } | null;
};

type SendConversationRehydrateInput = {
  conversationRef: string;
  messages: RehydrateConversationEntry[];
  workspacePath?: string | null;
};

/**
 * Renderer command facade for the SDK runtime hosted by Electron main.
 *
 * Chat UI code should use this module instead of reaching for low-level
 * backend IPC methods directly. The underlying transport is still the existing
 * IPC bridge while the desktop migration continues.
 */
export const DesktopConversationRuntimeClient = {
  setModel(selection: WindieModelSelection): void {
    ApiClient.setModel(selection);
  },

  sendQuery(input: SendConversationQueryInput): Promise<void> {
    if (input.transcript) {
      recordUserMessage(input.text, {
        conversationRef: input.conversationRef,
        userId: input.transcript.userId ?? null,
        timestamp: input.transcript.timestamp ?? undefined,
        screenshotRef: input.transcript.screenshotRef ?? input.screenshotRef ?? null,
      });
    }
    return ApiClient.sendQuery(
      input.text,
      input.conversationRef,
      input.screenshotRef ?? null,
      input.screenshotUrl ?? null,
      input.screenshotRefs ?? null,
      input.captureMeta ?? null,
      input.attachmentContext ?? null,
      input.attachmentFilenames ?? null,
      input.screenshot ?? null,
      input.workspacePath ?? null,
    );
  },

  sendRehydrate(input: SendConversationRehydrateInput): Promise<void> {
    return ApiClient.sendRehydrateConversation(
      input.conversationRef,
      input.messages,
      input.workspacePath ?? null,
    );
  },

  stop(conversationRef: string | null = null): void {
    ApiClient.stopQuery(conversationRef);
  },

  compactHistory(force: boolean = true, conversationRef: string | null = null): void {
    ApiClient.compactHistory(force, conversationRef);
  },
};
