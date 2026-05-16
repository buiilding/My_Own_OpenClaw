import {
  ConversationContinuityService,
  type ListConversationOptions,
  type RehydrateSnapshot,
  type DisplayConversation,
  type ConversationMetadata,
  type CompactedReplaySnapshot,
} from '../../infrastructure/api/windieSdkClient';
import {
  ElectronSidecarConversationStore,
} from '../../infrastructure/transcript/ElectronSidecarConversationStore';
import {
  loadLocalConversationSnapshot,
} from '../../infrastructure/transcript/conversationLocalSnapshotLoader';
import {
  searchStoredConversations,
} from '../../infrastructure/transcript/localConversationStore';
import { createDesktopBackendTransport } from './desktopBackendTransport';
import type { LocalConversationSnapshot } from '../../infrastructure/transcript/conversationLocalSnapshotLoader';

type LoadRehydrateSnapshotInput = {
  conversationRef: string;
  userId: string;
};

type RehydrateFromStoreInput = LoadRehydrateSnapshotInput & {
  workspacePath?: string | null;
};

export const desktopConversationContinuityService = new ConversationContinuityService({
  storeFactory: ({ userId }) => new ElectronSidecarConversationStore({ userId }),
  transportFactory: ({ workspacePath }) => createDesktopBackendTransport(workspacePath ?? null),
});

export const DesktopConversationContinuityService = {
  listMetadata(userId: string, options?: ListConversationOptions): Promise<ConversationMetadata[]> {
    return desktopConversationContinuityService.listMetadata({ userId }, options);
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
    return desktopConversationContinuityService.deleteConversation({
      userId,
      conversationRef,
    });
  },

  loadLocalConversationSnapshot(
    input: Parameters<typeof loadLocalConversationSnapshot>[0],
  ): Promise<LocalConversationSnapshot> {
    return loadLocalConversationSnapshot(input);
  },

  searchConversations(input: Parameters<typeof searchStoredConversations>[0]) {
    return searchStoredConversations(input);
  },
};
