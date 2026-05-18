import {
  CHAT_EVENT_RECORD_KIND,
  ElectronSidecarConversationStore,
} from './ElectronSidecarConversationStore';
import { loadStoredConversationEntries } from './localConversationStore';
import { resolveConversationWorkspaceBinding } from '../workspace/conversationWorkspaceBinding';

type ConversationSnapshotOptions = {
  userId: string;
  conversationRef: string;
  recordKind?: string;
  conversation?: Record<string, unknown> | null;
  includeParsedMessages?: boolean;
  includeReplayState?: boolean;
};

type StoredConversationEntry = Record<string, unknown>;

export type LocalConversationSnapshot = {
  transcriptEntries: StoredConversationEntry[];
  replayEntries: StoredConversationEntry[];
  workspaceBinding: {
    workspacePath: string;
    workspaceName: string;
  };
  parsedMessages: Array<Record<string, unknown>>;
  rehydrateMessages: Array<Record<string, unknown>>;
};

export async function loadLocalConversationSnapshot({
  userId,
  conversationRef,
  recordKind = CHAT_EVENT_RECORD_KIND,
  conversation = null,
  includeParsedMessages = false,
  includeReplayState = false,
}: ConversationSnapshotOptions): Promise<LocalConversationSnapshot> {
  void includeReplayState;
  const transcriptEntries = await loadStoredConversationEntries({
    userId,
    conversationRef,
    recordKind,
  });
  const store = new ElectronSidecarConversationStore({ userId });
  const [displayConversation, rehydrateSnapshot] = await Promise.all([
    includeParsedMessages ? store.loadForDisplay(conversationRef) : Promise.resolve(null),
    store.loadForRehydrate(conversationRef),
  ]);

  return {
    transcriptEntries,
    replayEntries: [],
    workspaceBinding: resolveConversationWorkspaceBinding({
      conversation,
      memories: transcriptEntries,
    }),
    parsedMessages: displayConversation
      ? displayConversation.messages.map((message) => ({
        id: message.id,
        text: message.text,
        sender: message.sender,
        role: message.sender,
        message_type: message.messageType,
        timestamp: message.timestamp,
      }))
      : [],
    rehydrateMessages: rehydrateSnapshot.messages,
  };
}
