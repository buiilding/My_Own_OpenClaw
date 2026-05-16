import {
  DesktopTranscriptProjectionRuntimeClient,
} from './desktopTranscriptProjectionRuntimeClient';
import {
  loadLocalConversationSnapshot,
} from '../../infrastructure/transcript/conversationLocalSnapshotLoader';
import {
  searchStoredConversations,
} from '../../infrastructure/transcript/localConversationStore';

export const DesktopConversationLibraryClient = {
  async listMetadata(userId, options) {
    return DesktopTranscriptProjectionRuntimeClient.listMetadata(userId, options);
  },

  async loadForDisplay(userId, conversationRef) {
    return DesktopTranscriptProjectionRuntimeClient.loadForDisplay(userId, conversationRef);
  },

  async deleteConversation(userId, conversationRef) {
    await DesktopTranscriptProjectionRuntimeClient.deleteConversation(userId, conversationRef);
  },

  async loadLocalConversationSnapshot(input) {
    return loadLocalConversationSnapshot(input);
  },

  async searchConversations(input) {
    return searchStoredConversations(input);
  },
};
