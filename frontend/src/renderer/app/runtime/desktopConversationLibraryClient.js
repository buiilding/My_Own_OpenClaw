import {
  DesktopTranscriptProjectionRuntimeClient,
} from './desktopTranscriptProjectionRuntimeClient';

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
};
