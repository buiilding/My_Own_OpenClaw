import {
  DesktopConversationContinuityService,
} from './desktopConversationContinuityService';
import { invokeWindieCommand } from './windieCommandInvokeClient';

function metadataToDashboardConversation(metadata) {
  return {
    conversation_id: metadata?.conversationRef,
    record_kind: 'chat_event',
    title: metadata?.title || metadata?.conversationRef || '',
    last_message: metadata?.lastMessage || '',
    last_timestamp: metadata?.updatedAt || '',
    entry_count: metadata?.eventCount || 0,
    workspace_path: metadata?.workspacePath || '',
    workspace_name: metadata?.workspaceName || '',
    snippet: metadata?.snippet || '',
    matched_role: metadata?.matchedRole || '',
  };
}

export const DesktopConversationLibraryClient = {
  async listMetadata(userId, options) {
    return invokeWindieCommand('conversations.list', {
      userId,
      limit: options?.limit,
    });
  },

  async loadForDisplay(userId, conversationRef) {
    const snapshot = await invokeWindieCommand('conversation.loadDisplay', {
      userId,
      conversationRef,
    });
    return snapshot?.display || { conversationRef, messages: [] };
  },

  async loadDisplayRows(userId, conversationRef) {
    const snapshot = await invokeWindieCommand('conversation.loadDisplay', {
      userId,
      conversationRef,
    });
    return Array.isArray(snapshot?.displayRows) ? snapshot.displayRows : [];
  },

  async deleteConversation(userId, conversationRef) {
    await invokeWindieCommand('conversations.delete', {
      userId,
      conversationRef,
    });
  },

  async searchConversations(input) {
    const metadata = await invokeWindieCommand('conversations.search', {
      userId: input.userId,
      query: input.query,
      limit: input.limit,
    });
    return Array.isArray(metadata)
      ? metadata.map(metadataToDashboardConversation)
      : [];
  },

  subscribeMetadataInvalidations(listener) {
    return DesktopConversationContinuityService.subscribeMetadataInvalidations(listener);
  },
};
