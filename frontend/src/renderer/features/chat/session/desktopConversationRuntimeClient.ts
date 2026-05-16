import { ApiClient } from '../../../infrastructure/api/client';
import type { RehydrateConversationEntry } from '../../../infrastructure/api/client';
import type { CaptureMeta } from '../../../infrastructure/services/ScreenshotAttachmentPipeline';
import type { WindieModelSelection } from '../../../infrastructure/api/windieSdkClient';
import {
  getActiveConversationRef,
  getTranscriptSessionInfo,
  recordAssistantMessage,
  recordToolMessage,
  recordUserMessage,
  setActiveConversationRef,
  updateTranscriptSession,
} from '../../../infrastructure/transcript/TranscriptWriter';
import {
  ElectronSidecarConversationStore,
  type TranscriptProjectionRewriteEntry,
} from '../../../infrastructure/transcript/ElectronSidecarConversationStore';
import type {
  CompactedReplaySnapshot,
  RehydrateSnapshot,
} from '../../../infrastructure/api/windieSdkClient';

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

type RewriteTranscriptProjectionInput = {
  conversationRef: string;
  userId: string;
  transcriptEntries: TranscriptProjectionRewriteEntry[];
  rehydrateEntries: TranscriptProjectionRewriteEntry[];
};

type LoadRehydrateSnapshotInput = {
  conversationRef: string;
  userId: string;
};

/**
 * Renderer command facade for the SDK runtime hosted by Electron main.
 *
 * Chat UI code should use this module instead of reaching for low-level
 * backend IPC methods directly. The underlying transport is still the existing
 * IPC bridge while the desktop migration continues.
 */
export const DesktopConversationRuntimeClient = {
  getActiveConversationRef(): string | null {
    return getActiveConversationRef();
  },

  getTranscriptSessionInfo(): ReturnType<typeof getTranscriptSessionInfo> {
    return getTranscriptSessionInfo();
  },

  setActiveConversationRef(conversationRef: string | null): void {
    setActiveConversationRef(conversationRef);
  },

  updateTranscriptSession(
    conversationRef?: string | null,
    userId?: string | null,
  ): void {
    updateTranscriptSession(conversationRef, userId);
  },

  setModel(selection: WindieModelSelection): void {
    ApiClient.setModel(selection);
  },

  recordAssistantMessage(
    text: string,
    options: Parameters<typeof recordAssistantMessage>[1] = {},
  ): void {
    recordAssistantMessage(text, options);
  },

  recordToolMessage(
    text: string,
    options: Parameters<typeof recordToolMessage>[1],
  ): void {
    recordToolMessage(text, options);
  },

  async replaceCompactedReplay(
    snapshot: CompactedReplaySnapshot,
    userId: string,
  ): Promise<void> {
    const store = new ElectronSidecarConversationStore({ userId });
    await store.replaceCompactedReplay(snapshot);
  },

  async rewriteTranscriptProjection({
    conversationRef,
    userId,
    transcriptEntries,
    rehydrateEntries,
  }: RewriteTranscriptProjectionInput): Promise<RehydrateSnapshot> {
    const store = new ElectronSidecarConversationStore({ userId });
    return store.rewriteTranscriptProjection({
      conversationRef,
      entries: transcriptEntries,
      rehydrateEntries,
    });
  },

  async loadRehydrateSnapshot({
    conversationRef,
    userId,
  }: LoadRehydrateSnapshotInput): Promise<RehydrateSnapshot> {
    const store = new ElectronSidecarConversationStore({ userId });
    return store.loadForRehydrate(conversationRef);
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
