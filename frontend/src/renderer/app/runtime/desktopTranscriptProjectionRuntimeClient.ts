import {
  recordAssistantMessage,
  recordToolMessage,
  recordUserMessage,
} from '../../infrastructure/transcript/TranscriptWriter';
import {
  ElectronSidecarConversationStore,
  type TranscriptProjectionRewriteEntry,
} from '../../infrastructure/transcript/ElectronSidecarConversationStore';
import type {
  CompactedReplaySnapshot,
  RehydrateSnapshot,
} from '../../infrastructure/api/windieSdkClient';

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

export const DesktopTranscriptProjectionRuntimeClient = {
  recordUserMessage(
    text: string,
    options: Parameters<typeof recordUserMessage>[1] = {},
  ): void {
    recordUserMessage(text, options);
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
};

export type {
  LoadRehydrateSnapshotInput,
  RewriteTranscriptProjectionInput,
  TranscriptProjectionRewriteEntry,
};
