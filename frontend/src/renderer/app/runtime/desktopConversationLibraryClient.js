import {
  DesktopTranscriptProjectionRuntimeClient,
} from './desktopTranscriptProjectionRuntimeClient';
import {
  loadLocalConversationSnapshot,
} from '../../infrastructure/transcript/conversationLocalSnapshotLoader';

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
};
