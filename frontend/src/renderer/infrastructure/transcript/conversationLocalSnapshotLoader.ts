import {
  CHAT_EVENT_RECORD_KIND,
  createDesktopConversationStore,
} from './desktopConversationStore';
import { resolveConversationWorkspaceBinding } from '../workspace/conversationWorkspaceBinding';
import type { ConversationEvent } from '../api/windieSdkClient';

type ConversationSnapshotOptions = {
  userId: string;
  conversationRef: string;
  recordKind?: string;
  conversation?: Record<string, unknown> | null;
  includeParsedMessages?: boolean;
  includeReplayState?: boolean;
};

type StoredConversationEntry = ConversationEvent;

type WorkspaceConversationRecord = {
  workspace_path?: string;
  workspace_name?: string;
};

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

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function conversationHasWorkspace(conversation: Record<string, unknown> | null): boolean {
  return Boolean(
    conversation
    && (
      nonEmptyString(conversation.workspace_path)
      || nonEmptyString(conversation.workspacePath)
    ),
  );
}

function workspaceConversationFromMetadata(metadata: {
  workspacePath?: string | null;
  workspaceName?: string | null;
} | null): WorkspaceConversationRecord {
  return {
    workspace_path: metadata?.workspacePath ?? '',
    workspace_name: metadata?.workspaceName ?? '',
  };
}

export async function loadLocalConversationSnapshot({
  userId,
  conversationRef,
  recordKind = CHAT_EVENT_RECORD_KIND,
  conversation = null,
  includeParsedMessages = false,
  includeReplayState = false,
}: ConversationSnapshotOptions): Promise<LocalConversationSnapshot> {
  void recordKind;
  void includeReplayState;
  const store = createDesktopConversationStore(userId);
  const [transcriptEntries, displayRows, rehydrateSnapshot, metadata] = await Promise.all([
    store.loadEvents(conversationRef),
    includeParsedMessages ? store.loadDisplayRows(conversationRef) : Promise.resolve(null),
    store.loadForRehydrate(conversationRef),
    store.listMetadata().then((items) => (
      items.find((item) => item.conversationRef === conversationRef) ?? null
    )).catch(() => null),
  ]);

  return {
    transcriptEntries,
    replayEntries: [],
    workspaceBinding: resolveConversationWorkspaceBinding({
      conversation: conversationHasWorkspace(conversation)
        ? conversation
        : workspaceConversationFromMetadata(metadata),
      memories: transcriptEntries.map((event) => ({
        metadata: {
          workspace_path: event.payload?.workspacePath ?? event.payload?.workspace_path,
          workspace_name: event.payload?.workspaceName ?? event.payload?.workspace_name,
        },
      })),
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
