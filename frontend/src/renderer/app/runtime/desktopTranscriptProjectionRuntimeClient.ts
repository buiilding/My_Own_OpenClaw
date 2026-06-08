import {
  createDesktopConversationStore,
  rewriteTranscriptProjection as rewriteDesktopTranscriptProjection,
  type TranscriptProjectionRewriteEntry,
} from '../../infrastructure/transcript/desktopConversationStore';
import type {
  CompactedReplaySnapshot,
  DisplayConversation,
  ConversationMetadata,
  ConversationStore,
  ListConversationOptions,
  RehydrateSnapshot,
} from '../../infrastructure/api/windieSdkClient';
import { invokeWindieCommand } from './windieCommandInvokeClient';

type RewriteTranscriptProjectionInput = {
  conversationRef: string;
  userId: string;
  transcriptEntries: TranscriptProjectionRewriteEntry[];
  rehydrateEntries: TranscriptProjectionRewriteEntry[];
};

type SeededConversationStoreInput = {
  conversationRef: string;
  userId: string;
  projectionEntries: TranscriptProjectionRewriteEntry[];
};

export const DesktopTranscriptProjectionRuntimeClient = {
  async replaceCompactedReplay(
    snapshot: CompactedReplaySnapshot,
    userId: string,
  ): Promise<void> {
    const store = createDesktopConversationStore(userId);
    await store.replaceCompactedReplay(snapshot);
  },

  async rewriteTranscriptProjection({
    conversationRef,
    userId,
    transcriptEntries,
    rehydrateEntries,
  }: RewriteTranscriptProjectionInput): Promise<RehydrateSnapshot> {
    return rewriteDesktopTranscriptProjection({
      conversationRef,
      userId,
      entries: transcriptEntries,
      rehydrateEntries,
    });
  },

  async listMetadata(userId: string, options?: ListConversationOptions): Promise<ConversationMetadata[]> {
    const metadata = await invokeWindieCommand<ConversationMetadata[]>('conversations.list', {
      userId,
      limit: options?.limit,
    });
    return Array.isArray(metadata) ? metadata : [];
  },

  async loadForDisplay(userId: string, conversationRef: string): Promise<DisplayConversation> {
    const snapshot = await invokeWindieCommand<{
      display?: DisplayConversation;
    }>('conversation.loadDisplay', {
      userId,
      conversationRef,
    });
    return snapshot?.display ?? {
      conversationRef,
      revisionId: '',
      messages: [],
      compaction: { status: 'idle' },
    };
  },

  async deleteConversation(userId: string, conversationRef: string): Promise<void> {
    await invokeWindieCommand('conversations.delete', {
      userId,
      conversationRef,
    });
  },

  async createSeededConversationStore({
    conversationRef,
    userId,
    projectionEntries,
  }: SeededConversationStoreInput): Promise<ConversationStore> {
    const store = createDesktopConversationStore(userId);
    await rewriteDesktopTranscriptProjection({
      conversationRef,
      userId,
      entries: projectionEntries,
      rehydrateEntries: projectionEntries,
    });
    return store;
  },
};

export type {
  RewriteTranscriptProjectionInput,
  TranscriptProjectionRewriteEntry,
};
