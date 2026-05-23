import { ApiClient } from '../../infrastructure/api/client';
import type { RehydrateConversationEntry } from '../../infrastructure/api/client';

type SendConversationRehydrateInput = {
  conversationRef: string;
  messages: RehydrateConversationEntry[];
  workspacePath?: string | null;
};

export const DesktopBackendCommandRuntimeClient = {
  rehydrateConversation(input: SendConversationRehydrateInput): Promise<void> {
    return ApiClient.rehydrateConversation(
      input.conversationRef,
      input.messages,
      input.workspacePath ?? null,
    );
  },

  compactHistory(force: boolean = true, conversationRef: string | null = null): void {
    ApiClient.compactHistory(force, conversationRef);
  },
};

export type {
  RehydrateConversationEntry,
  SendConversationRehydrateInput,
};
