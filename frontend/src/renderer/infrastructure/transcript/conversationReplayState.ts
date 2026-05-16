import { toRehydrateMessagePayload, DEFAULT_USER_ID } from '../../features/dashboard/utils/episodicMemoryUtils';
import { loadStoredConversationEntries } from './localConversationStore';

export const TRANSCRIPT_REPLAY_RECORD_KIND = 'transcript_replay';

type ReplayInitState = 'already-initialized' | 'bootstrapped' | 'empty';

type ReplaySnapshotEntry = {
  messageIndex?: number | null;
  rehydrateEntry: Record<string, unknown>;
};

type ReplayGenerationMetadata = {
  generationId?: string | null;
  sourceRevisionId?: string | null;
  sourceTurnRef?: string | null;
  entryCount?: number | null;
  complete?: boolean;
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

export type ConversationReplayStoreDeps = {
  deleteConversationRecordKind: (
    context: ReplayStoreContext,
    recordKind: string,
  ) => Promise<void>;
  storeReplayRow: (
    context: ReplayStoreContext,
    entry: ReplaySnapshotEntry,
  ) => Promise<void>;
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
  deps: Pick<ConversationReplayStoreDeps, 'deleteConversationRecordKind'>,
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
    deleteOperations.push(deps.deleteConversationRecordKind({
      ...context,
      conversationRef: normalizedConversationRef,
      userId: normalizedUserId,
    }, 'transcript'));
  }
  if (includeReplayState) {
    deleteOperations.push(deps.deleteConversationRecordKind({
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

export function buildReplayRowStoragePayload(
  context: ReplayStoreContext,
  {
    messageIndex,
    rehydrateEntry,
  }: ReplaySnapshotEntry,
): Record<string, unknown> {
  return {
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
  };
}

export async function replaceConversationReplayState(
  context: ReplayStoreContext,
  entries: ReplaySnapshotEntry[],
  deps: Pick<ConversationReplayStoreDeps, 'storeReplayRow'>,
  generation: ReplayGenerationMetadata = {},
): Promise<void> {
  const normalizedConversationRef = normalizeConversationRef(context.conversationRef);
  if (!normalizedConversationRef) {
    return;
  }
  const normalizedUserId = normalizeUserId(context.userId);
  const replayKey = getReplayConversationKey(normalizedConversationRef, normalizedUserId);
  replayMutationEpochs.set(replayKey, (replayMutationEpochs.get(replayKey) || 0) + 1);

  const generationId = typeof generation.generationId === 'string' && generation.generationId.trim()
    ? generation.generationId.trim()
    : `replay-${Date.now()}`;
  const entryCount = typeof generation.entryCount === 'number' && Number.isFinite(generation.entryCount)
    ? Math.max(0, Math.floor(generation.entryCount))
    : entries.length;
  const generationComplete = generation.complete !== false;

  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    await deps.storeReplayRow(context, {
      messageIndex: entry.messageIndex ?? (index + 1),
      rehydrateEntry: {
        ...entry.rehydrateEntry,
        replay_generation_id: generationId,
        replay_source_revision_id: generation.sourceRevisionId ?? entry.rehydrateEntry.replay_source_revision_id ?? null,
        replay_source_turn_ref: generation.sourceTurnRef ?? entry.rehydrateEntry.replay_source_turn_ref ?? null,
        replay_generation_entry_index: index + 1,
        replay_generation_entry_count: entryCount,
        replay_generation_complete: generationComplete,
      },
    });
  }

  initializedReplayConversations.add(
    replayKey,
  );
}

export async function appendConversationReplayEntry(
  context: ReplayStoreContext,
  entry: ReplaySnapshotEntry,
  deps: Pick<ConversationReplayStoreDeps, 'storeReplayRow'>,
): Promise<void> {
  await deps.storeReplayRow(context, entry);
  initializedReplayConversations.add(
    getReplayConversationKey(context.conversationRef, context.userId),
  );
}

export async function ensureConversationReplayStateInitialized(
  context: ReplayStoreContext,
  deps: Pick<ConversationReplayStoreDeps, 'storeReplayRow'>,
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
      deps,
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
