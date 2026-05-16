import type { WindieModelSelection } from '../../infrastructure/api/windieSdkClient';
import { DesktopTranscriptSessionRuntimeClient } from './desktopTranscriptSessionRuntimeClient';
import { DesktopSettingsRuntimeClient } from './desktopSettingsRuntimeClient';
import {
  DesktopBackendCommandRuntimeClient,
  type RehydrateConversationEntry,
  type SendConversationQueryInput as BackendSendConversationQueryInput,
  type SendConversationRehydrateInput,
} from './desktopBackendCommandRuntimeClient';
import {
  DesktopTranscriptProjectionRuntimeClient,
  type RewriteTranscriptProjectionInput,
  type LoadRehydrateSnapshotInput,
} from './desktopTranscriptProjectionRuntimeClient';
import type { CompactedReplaySnapshot } from '../../infrastructure/api/windieSdkClient';

export type { RehydrateConversationEntry };

type SendConversationQueryInput = {
  text: BackendSendConversationQueryInput['text'];
  conversationRef: BackendSendConversationQueryInput['conversationRef'];
  screenshotRef?: BackendSendConversationQueryInput['screenshotRef'];
  screenshotUrl?: BackendSendConversationQueryInput['screenshotUrl'];
  screenshotRefs?: BackendSendConversationQueryInput['screenshotRefs'];
  captureMeta?: BackendSendConversationQueryInput['captureMeta'];
  attachmentContext?: BackendSendConversationQueryInput['attachmentContext'];
  attachmentFilenames?: BackendSendConversationQueryInput['attachmentFilenames'];
  screenshot?: BackendSendConversationQueryInput['screenshot'];
  workspacePath?: BackendSendConversationQueryInput['workspacePath'];
  transcript?: {
    userId?: string | null;
    timestamp?: string | null;
    screenshotRef?: string | null;
  } | null;
};

/**
 * Renderer command facade for the SDK runtime hosted by Electron main.
 *
 * Feature code should use this app runtime module instead of importing
 * low-level backend IPC or transcript storage adapters directly.
 */
export const DesktopConversationRuntimeClient = {
  getActiveConversationRef(): string | null {
    return DesktopTranscriptSessionRuntimeClient.getActiveConversationRef();
  },

  getTranscriptSessionInfo(): ReturnType<typeof DesktopTranscriptSessionRuntimeClient.getTranscriptSessionInfo> {
    return DesktopTranscriptSessionRuntimeClient.getTranscriptSessionInfo();
  },

  setActiveConversationRef(conversationRef: string | null): void {
    DesktopTranscriptSessionRuntimeClient.setActiveConversationRef(conversationRef);
  },

  updateTranscriptSession(
    conversationRef?: string | null,
    userId?: string | null,
  ): void {
    DesktopTranscriptSessionRuntimeClient.updateTranscriptSession(conversationRef, userId);
  },

  setModel(selection: WindieModelSelection): void {
    DesktopSettingsRuntimeClient.setModel(selection);
  },

  recordAssistantMessage(
    text: string,
    options: Parameters<typeof DesktopTranscriptProjectionRuntimeClient.recordAssistantMessage>[1] = {},
  ): void {
    DesktopTranscriptProjectionRuntimeClient.recordAssistantMessage(text, options);
  },

  recordToolMessage(
    text: string,
    options: Parameters<typeof DesktopTranscriptProjectionRuntimeClient.recordToolMessage>[1],
  ): void {
    DesktopTranscriptProjectionRuntimeClient.recordToolMessage(text, options);
  },

  async replaceCompactedReplay(
    snapshot: CompactedReplaySnapshot,
    userId: string,
  ): Promise<void> {
    await DesktopTranscriptProjectionRuntimeClient.replaceCompactedReplay(snapshot, userId);
  },

  async rewriteTranscriptProjection(input: RewriteTranscriptProjectionInput) {
    return DesktopTranscriptProjectionRuntimeClient.rewriteTranscriptProjection(input);
  },

  async loadRehydrateSnapshot(input: LoadRehydrateSnapshotInput) {
    return DesktopTranscriptProjectionRuntimeClient.loadRehydrateSnapshot(input);
  },

  sendQuery(input: SendConversationQueryInput): Promise<void> {
    if (input.transcript) {
      DesktopTranscriptProjectionRuntimeClient.recordUserMessage(input.text, {
        conversationRef: input.conversationRef,
        userId: input.transcript.userId ?? null,
        timestamp: input.transcript.timestamp ?? undefined,
        screenshotRef: input.transcript.screenshotRef ?? input.screenshotRef ?? null,
      });
    }
    return DesktopBackendCommandRuntimeClient.sendQuery(input);
  },

  sendRehydrate(input: SendConversationRehydrateInput): Promise<void> {
    return DesktopBackendCommandRuntimeClient.sendRehydrate(input);
  },

  stop(conversationRef: string | null = null): void {
    DesktopBackendCommandRuntimeClient.stop(conversationRef);
  },

  compactHistory(force: boolean = true, conversationRef: string | null = null): void {
    DesktopBackendCommandRuntimeClient.compactHistory(force, conversationRef);
  },
};
