import {
  ElectronSidecarConversationStore,
} from '../../infrastructure/transcript/ElectronSidecarConversationStore';

function createConversationStore(userId) {
  return new ElectronSidecarConversationStore({ userId });
}

export const DesktopConversationLibraryClient = {
  async listMetadata(userId, options) {
    const store = createConversationStore(userId);
    return store.listMetadata(options);
  },

  async loadForDisplay(userId, conversationRef) {
    const store = createConversationStore(userId);
    return store.loadForDisplay(conversationRef);
  },

  async deleteConversation(userId, conversationRef) {
    const store = createConversationStore(userId);
    await store.deleteConversation(conversationRef);
  },
};
