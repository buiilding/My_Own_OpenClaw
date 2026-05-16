import {
  DesktopConversationContinuityService,
} from './desktopConversationContinuityService';

export const DesktopConversationLibraryClient = {
  async listMetadata(userId, options) {
    return DesktopConversationContinuityService.listMetadata(userId, options);
  },

  async loadForDisplay(userId, conversationRef) {
    return DesktopConversationContinuityService.loadForDisplay(userId, conversationRef);
  },

  async deleteConversation(userId, conversationRef) {
    await DesktopConversationContinuityService.deleteConversation(userId, conversationRef);
  },

  async loadLocalConversationSnapshot(input) {
    return DesktopConversationContinuityService.loadLocalConversationSnapshot(input);
  },

  async searchConversations(input) {
    return DesktopConversationContinuityService.searchConversations(input);
  },
};
