import {
  ConversationContinuityService,
  type ListConversationOptions,
  type RehydrateSnapshot,
  type DisplayConversation,
  type ConversationMetadata,
  type ConversationMetadataInvalidationListener,
  type CompactedReplaySnapshot,
} from '../../infrastructure/api/windieSdkClient';
import {
  DesktopConversationStoreAdapter,
} from '../../infrastructure/transcript/desktopConversationStoreAdapter';
import {
  loadLocalConversationSnapshot,
} from '../../infrastructure/transcript/conversationLocalSnapshotLoader';
import { createDesktopBackendTransport } from './desktopBackendTransport';
import { DesktopLocalRuntimeEventSource } from './desktopLocalRuntimeEventSource';
import { createIpcSidecarConversationStore } from '../../infrastructure/transcript/sdkSidecarConversationStore';
import type { LocalConversationSnapshot } from '../../infrastructure/transcript/conversationLocalSnapshotLoader';

type LoadRehydrateSnapshotInput = {
  conversationRef: string;
  userId: string;
};

type RehydrateFromStoreInput = LoadRehydrateSnapshotInput & {
  workspacePath?: string | null;
};

type SearchConversationsInput = {
  userId: string;
  query: string;
  limit?: number;
};

export const desktopConversationContinuityService = new ConversationContinuityService({
  storeFactory: ({ userId }) => new DesktopConversationStoreAdapter({ userId }),
  transportFactory: ({ workspacePath }) => createDesktopBackendTransport(workspacePath ?? null),
  localRuntimeEventSource: DesktopLocalRuntimeEventSource,
});

export const desktopConversationMetadataService = new ConversationContinuityService({
  storeFactory: ({ userId }) => createIpcSidecarConversationStore(userId),
  localRuntimeEventSource: DesktopLocalRuntimeEventSource,
});

function metadataToDashboardConversation(metadata: ConversationMetadata) {
  return {
    conversation_id: metadata.conversationRef,
    record_kind: 'chat_event',
    title: metadata.title || metadata.conversationRef,
    last_message: metadata.lastMessage || '',
    last_timestamp: metadata.updatedAt,
    entry_count: metadata.eventCount,
    workspace_path: metadata.workspacePath || '',
    workspace_name: metadata.workspaceName || '',
    snippet: metadata.snippet || '',
    matched_role: metadata.matchedRole || '',
  };
}

export const DesktopConversationContinuityService = {
  listMetadata(userId: string, options?: ListConversationOptions): Promise<ConversationMetadata[]> {
    return desktopConversationMetadataService.listMetadata({ userId }, options);
  },

  loadForDisplay(userId: string, conversationRef: string): Promise<DisplayConversation> {
    return desktopConversationContinuityService.loadForDisplay({ userId, conversationRef });
  },

  loadRehydrateSnapshot(input: LoadRehydrateSnapshotInput): Promise<RehydrateSnapshot> {
    return desktopConversationContinuityService.loadRehydrateSnapshot(input);
  },

  rehydrateFromStore(input: RehydrateFromStoreInput) {
    return desktopConversationContinuityService.rehydrateFromStore(input);
  },

  replaceCompactedReplay(snapshot: CompactedReplaySnapshot, userId: string) {
    return desktopConversationContinuityService.replaceCompactedReplay({
      userId,
      snapshot,
    });
  },

  deleteConversation(userId: string, conversationRef: string) {
    return desktopConversationMetadataService.deleteConversation({
      userId,
      conversationRef,
    });
  },

  loadLocalConversationSnapshot(
    input: Parameters<typeof loadLocalConversationSnapshot>[0],
  ): Promise<LocalConversationSnapshot> {
    return loadLocalConversationSnapshot(input);
  },

  async searchConversations(input: SearchConversationsInput) {
    const metadata = await desktopConversationMetadataService.searchMetadata({
      userId: input.userId,
    }, {
      query: input.query,
      limit: input.limit,
    });
    return metadata.map(metadataToDashboardConversation);
  },

  subscribeMetadataInvalidations(listener: ConversationMetadataInvalidationListener) {
    return desktopConversationMetadataService.subscribeMetadataInvalidations(listener);
  },
};
