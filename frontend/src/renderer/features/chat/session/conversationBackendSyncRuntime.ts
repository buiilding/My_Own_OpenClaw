import { ApiClient } from '../../../infrastructure/api/client';
import { loadConversationTranscriptMemories } from '../../../infrastructure/transcript/conversationTranscriptLoader';
import {
  readStoredReplayRehydrateEntry,
  TRANSCRIPT_REPLAY_RECORD_KIND,
} from '../../../infrastructure/transcript/conversationReplayState';
import {
  getConversationWorkspaceBinding,
  resolveConversationWorkspaceBinding,
  setConversationWorkspaceBinding,
} from '../../../infrastructure/workspace/conversationWorkspaceBinding';
import {
  DEFAULT_USER_ID,
  toRehydrateMessagePayload,
} from '../../dashboard/utils/episodicMemoryUtils';

export type ConversationBackendSyncState = 'unknown' | 'synced' | 'fresh-local';

type EnsureConversationBackendStateOptions = {
  conversationRef: string | null | undefined;
  userId?: string | null;
  recordKind?: string;
};

type RehydrateConversationBackendStateOptions = {
  conversationRef: string | null | undefined;
  messages: Array<Record<string, unknown>>;
};

type SyncStateRecord = {
  state: ConversationBackendSyncState;
  epoch: number;
};

const syncStates = new Map<string, SyncStateRecord>();
const inFlightEnsures = new Map<string, Promise<void>>();
let connectionEpoch = 0;

function normalizeConversationRef(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function resolveUserId(userId: string | null | undefined): string {
  if (typeof userId === 'string' && userId.trim().length > 0) {
    return userId.trim();
  }
  return DEFAULT_USER_ID;
}

function setConversationBackendSyncState(
  conversationRef: string,
  state: ConversationBackendSyncState,
): void {
  syncStates.set(conversationRef, {
    state,
    epoch: connectionEpoch,
  });
}

function getEnsureKey(conversationRef: string): string {
  return `${connectionEpoch}:${conversationRef}`;
}

export function getConversationBackendSyncState(
  conversationRef: string | null | undefined,
): ConversationBackendSyncState | null {
  const normalizedConversationRef = normalizeConversationRef(conversationRef);
  if (!normalizedConversationRef) {
    return null;
  }
  const entry = syncStates.get(normalizedConversationRef);
  if (!entry || entry.epoch !== connectionEpoch) {
    return null;
  }
  return entry.state;
}

export function markConversationBackendStateUnknown(
  conversationRef: string | null | undefined,
): void {
  const normalizedConversationRef = normalizeConversationRef(conversationRef);
  if (!normalizedConversationRef) {
    return;
  }
  setConversationBackendSyncState(normalizedConversationRef, 'unknown');
}

export function markConversationBackendStateSynced(
  conversationRef: string | null | undefined,
): void {
  const normalizedConversationRef = normalizeConversationRef(conversationRef);
  if (!normalizedConversationRef) {
    return;
  }
  setConversationBackendSyncState(normalizedConversationRef, 'synced');
}

export function markConversationBackendStateFreshLocal(
  conversationRef: string | null | undefined,
): void {
  const normalizedConversationRef = normalizeConversationRef(conversationRef);
  if (!normalizedConversationRef) {
    return;
  }
  setConversationBackendSyncState(normalizedConversationRef, 'fresh-local');
}

export function clearConversationBackendSyncState(
  conversationRef: string | null | undefined,
): void {
  const normalizedConversationRef = normalizeConversationRef(conversationRef);
  if (!normalizedConversationRef) {
    return;
  }
  syncStates.delete(normalizedConversationRef);
  inFlightEnsures.delete(getEnsureKey(normalizedConversationRef));
}

export function invalidateConversationBackendSyncState(): void {
  connectionEpoch += 1;
  syncStates.clear();
  inFlightEnsures.clear();
}

export async function ensureConversationBackendState({
  conversationRef,
  userId,
  recordKind = 'transcript',
}: EnsureConversationBackendStateOptions): Promise<void> {
  const normalizedConversationRef = normalizeConversationRef(conversationRef);
  if (!normalizedConversationRef) {
    return;
  }

  const currentState = getConversationBackendSyncState(normalizedConversationRef);
  if (currentState === 'synced') {
    return;
  }
  if (currentState === 'fresh-local') {
    markConversationBackendStateSynced(normalizedConversationRef);
    return;
  }

  const ensureKey = getEnsureKey(normalizedConversationRef);
  const activeEnsure = inFlightEnsures.get(ensureKey);
  if (activeEnsure) {
    return activeEnsure;
  }

  const startingEpoch = connectionEpoch;
  const ensurePromise = (async () => {
    const replayMemories = await loadConversationTranscriptMemories({
      userId: resolveUserId(userId),
      conversationRef: normalizedConversationRef,
      recordKind: TRANSCRIPT_REPLAY_RECORD_KIND,
    });
    const memories = replayMemories.length > 0
      ? replayMemories
      : await loadConversationTranscriptMemories({
        userId: resolveUserId(userId),
        conversationRef: normalizedConversationRef,
        recordKind,
      });
    const resolvedBinding = resolveConversationWorkspaceBinding({ memories });
    setConversationWorkspaceBinding(normalizedConversationRef, resolvedBinding);
    if (memories.length > 0) {
      const rehydrateMessages = replayMemories.length > 0
        ? memories.map((memory) => readStoredReplayRehydrateEntry(memory) || toRehydrateMessagePayload(memory))
        : memories.map(toRehydrateMessagePayload);
      await ApiClient.sendRehydrateConversation(
        normalizedConversationRef,
        rehydrateMessages,
        getConversationWorkspaceBinding(normalizedConversationRef).workspacePath || null,
      );
    }
    if (startingEpoch === connectionEpoch) {
      markConversationBackendStateSynced(normalizedConversationRef);
    }
  })();

  inFlightEnsures.set(ensureKey, ensurePromise);
  try {
    await ensurePromise;
  } finally {
    if (inFlightEnsures.get(ensureKey) === ensurePromise) {
      inFlightEnsures.delete(ensureKey);
    }
  }
}

export async function rehydrateConversationBackendState({
  conversationRef,
  messages,
}: RehydrateConversationBackendStateOptions): Promise<void> {
  const normalizedConversationRef = normalizeConversationRef(conversationRef);
  if (!normalizedConversationRef) {
    return;
  }

  const startingEpoch = connectionEpoch;
  await ApiClient.sendRehydrateConversation(
    normalizedConversationRef,
    messages,
    getConversationWorkspaceBinding(normalizedConversationRef).workspacePath || null,
  );
  if (startingEpoch === connectionEpoch) {
    markConversationBackendStateSynced(normalizedConversationRef);
  }
}
