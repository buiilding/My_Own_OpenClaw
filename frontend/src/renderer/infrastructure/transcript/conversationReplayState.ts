import { toRehydrateMessagePayload, DEFAULT_USER_ID } from '../../features/dashboard/utils/episodicMemoryUtils';
import { IpcBridge, INVOKE_CHANNELS } from '../ipc/bridge';
import { loadStoredConversationEntries } from './localConversationStore';

export const TRANSCRIPT_REPLAY_RECORD_KIND = 'transcript_replay';

type ReplayInitState = 'already-initialized' | 'bootstrapped' | 'empty';

type ReplaySnapshotEntry = {
  messageIndex?: number | null;
  rehydrateEntry: Record<string, unknown>;
};

type ReplayStoreContext = {
  conversationRef: string;
  userId: string;
  workspacePath?: string | null;
  workspaceName?: string | null;
};

type ConversationStateDeleteOptions = {
  includeTranscript?: boolean;
  includeReplayState?: boolean;
};

const initializedReplayConversations = new Set<string>();
const inFlightReplayInitializations = new Map<string, Promise<ReplayInitState>>();
const replayMutationEpochs = new Map<string, number>();

function getReplayConversationKey(conversationRef: string, userId: string): string {
  return `${userId}:${conversationRef}`;
}

function normalizeConversationRef(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeUserId(value: unknown): string {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim();
  }
  return DEFAULT_USER_ID;
}

function resolveMemoryMessageIndex(memory: Record<string, unknown>, fallbackIndex: number): number {
  const candidate = memory?.message_index ?? memory?.messageIndex;
  if (typeof candidate === 'number' && Number.isFinite(candidate)) {
    return candidate;
  }
  if (typeof candidate === 'string') {
    const parsed = Number.parseInt(candidate, 10);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return fallbackIndex;
}

function resolveReplayStorageContent(rehydrateEntry: Record<string, unknown>): string {
  const content = rehydrateEntry?.content;
  if (typeof content === 'string' && content.length > 0) {
    return content;
  }
  return '[internal replay entry]';
}

function resolveStoredReplayMetadata(memory: unknown): Record<string, unknown> {
  if (!memory || typeof memory !== 'object') {
    return {};
  }
  const metadata = (memory as { metadata?: unknown }).metadata;
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return {};
  }
  return metadata as Record<string, unknown>;
}

function clearReplayInitialization(
  conversationRef: string,
  userId: string,
): void {
  const replayKey = getReplayConversationKey(conversationRef, userId);
  initializedReplayConversations.delete(replayKey);
  inFlightReplayInitializations.delete(replayKey);
  replayMutationEpochs.set(replayKey, (replayMutationEpochs.get(replayKey) || 0) + 1);
}

function getReplayMutationEpoch(replayKey: string): number {
  return replayMutationEpochs.get(replayKey) || 0;
}

async function deleteConversationRecordKind(
  context: ReplayStoreContext,
  recordKind: string,
): Promise<void> {
  const result = await IpcBridge.invoke(INVOKE_CHANNELS.DELETE_CONVERSATION, {
    userId: context.userId,
    conversationId: context.conversationRef,
    recordKind,
  });
  if (!result || result.success === false) {
    throw new Error(result?.error || `Failed to delete ${recordKind} conversation rows`);
  }
}

export function readStoredReplayRehydrateEntry(memory: unknown): Record<string, unknown> | null {
  const metadata = resolveStoredReplayMetadata(memory);
  const candidate = metadata.rehydrate_entry ?? metadata.rehydrateEntry;
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    return null;
  }
  return { ...(candidate as Record<string, unknown>) };
}

export function clearConversationReplayStateCache(): void {
  initializedReplayConversations.clear();
  inFlightReplayInitializations.clear();
  replayMutationEpochs.clear();
}

export async function deleteConversationStoredState(
  context: ReplayStoreContext,
  {
    includeTranscript = true,
    includeReplayState = true,
  }: ConversationStateDeleteOptions = {},
): Promise<void> {
  const normalizedConversationRef = normalizeConversationRef(context.conversationRef);
  if (!normalizedConversationRef) {
    return;
  }

  const normalizedUserId = normalizeUserId(context.userId);
  clearReplayInitialization(normalizedConversationRef, normalizedUserId);

  const deleteOperations: Promise<void>[] = [];
  if (includeTranscript) {
    deleteOperations.push(deleteConversationRecordKind({
      ...context,
      conversationRef: normalizedConversationRef,
      userId: normalizedUserId,
    }, 'transcript'));
  }
  if (includeReplayState) {
    deleteOperations.push(deleteConversationRecordKind({
      ...context,
      conversationRef: normalizedConversationRef,
      userId: normalizedUserId,
    }, TRANSCRIPT_REPLAY_RECORD_KIND));
  }

  const settledDeletes = await Promise.allSettled(deleteOperations);
  const failures = settledDeletes
    .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
    .map((result) => result.reason);
  if (failures.length > 0) {
    const firstFailure = failures[0];
    if (firstFailure instanceof Error) {
      throw firstFailure;
    }
    throw new Error('Failed to delete conversation state');
  }
}

async function storeReplayRow(
  context: ReplayStoreContext,
  {
    messageIndex,
    rehydrateEntry,
  }: ReplaySnapshotEntry,
): Promise<void> {
  await IpcBridge.invoke(INVOKE_CHANNELS.STORE_TRANSCRIPT, {
    content: resolveReplayStorageContent(rehydrateEntry),
    userId: context.userId,
    conversationRef: context.conversationRef,
    role: rehydrateEntry.role,
    messageType: rehydrateEntry.message_type,
    toolName: rehydrateEntry.tool_name,
    correlationId: rehydrateEntry.correlation_id ?? rehydrateEntry.tool_call_id ?? null,
    messageIndex,
    workspacePath: context.workspacePath ?? null,
    workspaceName: context.workspaceName ?? null,
    recordKind: TRANSCRIPT_REPLAY_RECORD_KIND,
    rehydrateEntry,
  });
}

export async function replaceConversationReplayState(
  context: ReplayStoreContext,
  entries: ReplaySnapshotEntry[],
): Promise<void> {
  await deleteConversationStoredState(context, {
    includeTranscript: false,
    includeReplayState: true,
  });

  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    await storeReplayRow(context, {
      messageIndex: entry.messageIndex ?? (index + 1),
      rehydrateEntry: entry.rehydrateEntry,
    });
  }

  initializedReplayConversations.add(
    getReplayConversationKey(context.conversationRef, context.userId),
  );
}

export async function appendConversationReplayEntry(
  context: ReplayStoreContext,
  entry: ReplaySnapshotEntry,
): Promise<void> {
  await storeReplayRow(context, entry);
  initializedReplayConversations.add(
    getReplayConversationKey(context.conversationRef, context.userId),
  );
}

export async function ensureConversationReplayStateInitialized(
  context: ReplayStoreContext,
): Promise<ReplayInitState> {
  const normalizedConversationRef = normalizeConversationRef(context.conversationRef);
  if (!normalizedConversationRef) {
    return 'empty';
  }
  const normalizedUserId = normalizeUserId(context.userId);
  const replayKey = getReplayConversationKey(normalizedConversationRef, normalizedUserId);
  const startingMutationEpoch = getReplayMutationEpoch(replayKey);
  if (initializedReplayConversations.has(replayKey)) {
    return 'already-initialized';
  }

  const activeInitialization = inFlightReplayInitializations.get(replayKey);
  if (activeInitialization) {
    return activeInitialization;
  }

  const initializationPromise = (async () => {
    const existingReplayRows = await loadStoredConversationEntries({
      userId: normalizedUserId,
      conversationRef: normalizedConversationRef,
      recordKind: TRANSCRIPT_REPLAY_RECORD_KIND,
      pageSize: 1,
      maxPages: 1,
    });
    if (getReplayMutationEpoch(replayKey) !== startingMutationEpoch) {
      return 'empty';
    }
    if (existingReplayRows.length > 0) {
      initializedReplayConversations.add(replayKey);
      return 'already-initialized';
    }

    const transcriptRows = await loadStoredConversationEntries({
      userId: normalizedUserId,
      conversationRef: normalizedConversationRef,
      recordKind: 'transcript',
    });
    if (getReplayMutationEpoch(replayKey) !== startingMutationEpoch) {
      return 'empty';
    }
    if (transcriptRows.length === 0) {
      return 'empty';
    }

    const rewriteStartingEpoch = getReplayMutationEpoch(replayKey);
    await replaceConversationReplayState(
      {
        ...context,
        conversationRef: normalizedConversationRef,
        userId: normalizedUserId,
      },
      transcriptRows.map((memory, index) => ({
        messageIndex: resolveMemoryMessageIndex(memory, index + 1),
        rehydrateEntry: toRehydrateMessagePayload(memory),
      })),
    );
    if (getReplayMutationEpoch(replayKey) !== (rewriteStartingEpoch + 1)) {
      return 'empty';
    }
    return 'bootstrapped';
  })();

  inFlightReplayInitializations.set(replayKey, initializationPromise);
  try {
    return await initializationPromise;
  } finally {
    if (inFlightReplayInitializations.get(replayKey) === initializationPromise) {
      inFlightReplayInitializations.delete(replayKey);
    }
  }
}
