import {
  parseMemoriesToMessages,
} from '../../features/dashboard/utils/episodicMemoryUtils';
import {
  readStoredReplayRehydrateEntry,
  TRANSCRIPT_REPLAY_RECORD_KIND,
} from './conversationReplayState';
import {
  buildStoredTranscriptRehydrateMessages,
} from './storedTranscriptSdkProjection';
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

function buildRehydrateMessages({
  conversationRef,
  transcriptEntries,
  replayEntries,
}: {
  conversationRef: string;
  transcriptEntries: StoredConversationEntry[];
  replayEntries: StoredConversationEntry[];
}): Array<Record<string, unknown>> {
  if (replayEntries.length > 0) {
    return replayEntries.map((entry) => readStoredReplayRehydrateEntry(entry) || buildStoredTranscriptRehydrateMessages([entry], {
      conversationRef,
    })[0]).filter((entry): entry is Record<string, unknown> => Boolean(entry));
  }
  return buildStoredTranscriptRehydrateMessages(transcriptEntries, {
    conversationRef,
  });
}

export async function loadLocalConversationSnapshot({
  userId,
  conversationRef,
  recordKind = 'transcript',
  conversation = null,
  includeParsedMessages = false,
  includeReplayState = false,
}: ConversationSnapshotOptions): Promise<LocalConversationSnapshot> {
  const [replayEntries, transcriptEntries] = await Promise.all([
    includeReplayState
      ? loadStoredConversationEntries({
        userId,
        conversationRef,
        recordKind: TRANSCRIPT_REPLAY_RECORD_KIND,
      })
      : Promise.resolve([]),
    loadStoredConversationEntries({
      userId,
      conversationRef,
      recordKind,
    }),
  ]);

  return {
    transcriptEntries,
    replayEntries,
    workspaceBinding: resolveConversationWorkspaceBinding({
      conversation,
      memories: transcriptEntries,
    }),
    parsedMessages: includeParsedMessages ? parseMemoriesToMessages(transcriptEntries) : [],
    rehydrateMessages: buildRehydrateMessages({
      conversationRef,
      transcriptEntries,
      replayEntries,
    }),
  };
}
