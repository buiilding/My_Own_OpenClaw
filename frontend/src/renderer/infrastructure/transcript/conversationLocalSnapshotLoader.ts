import {
  CHAT_EVENT_RECORD_KIND,
  createDesktopConversationStore,
} from './desktopConversationStore';
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
  const store = createDesktopConversationStore(userId);
  const [displayRows, rehydrateSnapshot] = await Promise.all([
    includeParsedMessages ? store.loadDisplayRows(conversationRef) : Promise.resolve(null),
    store.loadForRehydrate(conversationRef),
  ]);

  return {
    transcriptEntries,
    replayEntries: [],
    workspaceBinding: resolveConversationWorkspaceBinding({
      conversation,
      memories: transcriptEntries,
    }),
    parsedMessages: displayRows
      ? displayRows.map((row) => ({
        id: row.id,
        text: typeof row.content === 'string' ? row.content : JSON.stringify(row.content),
        sender: row.role,
        role: row.role,
        message_type: row.type,
        timestamp: row.metadata?.timestamp ?? null,
      }))
      : [],
    rehydrateMessages: rehydrateSnapshot.messages,
  };
}
