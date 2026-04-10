import { ApiClient } from '../../../infrastructure/api/client';
import { loadLocalConversationSnapshot } from '../../../infrastructure/transcript/conversationLocalSnapshotLoader';
import {
  getConversationWorkspaceBinding,
  setConversationWorkspaceBinding,
} from '../../../infrastructure/workspace/conversationWorkspaceBinding';
import { DEFAULT_USER_ID } from '../../dashboard/utils/episodicMemoryUtils';

/**
 * The backend only owns transient inference state. The frontend/sidecar transcript remains
 * the source of truth and can rehydrate a disposable backend session on demand.
 */
export type ConversationInferenceSessionState = 'unknown' | 'hydrated' | 'local-only';

type EnsureConversationInferenceSessionOptions = {
  conversationRef: string | null | undefined;
  userId?: string | null;
  recordKind?: string;
};

type RehydrateConversationInferenceSessionOptions = {
  conversationRef: string | null | undefined;
  messages: Array<Record<string, unknown>>;
};

type SyncStateRecord = {
  state: ConversationInferenceSessionState;
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

function setConversationInferenceSessionState(
  conversationRef: string,
  state: ConversationInferenceSessionState,
): void {
  syncStates.set(conversationRef, {
    state,
    epoch: connectionEpoch,
  });
}

function getEnsureKey(conversationRef: string): string {
  return `${connectionEpoch}:${conversationRef}`;
}

export function getConversationInferenceSessionState(
  conversationRef: string | null | undefined,
): ConversationInferenceSessionState | null {
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

export function markConversationInferenceSessionUnknown(
  conversationRef: string | null | undefined,
): void {
  const normalizedConversationRef = normalizeConversationRef(conversationRef);
  if (!normalizedConversationRef) {
    return;
  }
  setConversationInferenceSessionState(normalizedConversationRef, 'unknown');
}

export function markConversationInferenceSessionHydrated(
  conversationRef: string | null | undefined,
): void {
  const normalizedConversationRef = normalizeConversationRef(conversationRef);
  if (!normalizedConversationRef) {
    return;
  }
  setConversationInferenceSessionState(normalizedConversationRef, 'hydrated');
}

export function markConversationInferenceSessionLocalOnly(
  conversationRef: string | null | undefined,
): void {
  const normalizedConversationRef = normalizeConversationRef(conversationRef);
  if (!normalizedConversationRef) {
    return;
  }
  setConversationInferenceSessionState(normalizedConversationRef, 'local-only');
}

export function clearConversationInferenceSessionState(
  conversationRef: string | null | undefined,
): void {
  const normalizedConversationRef = normalizeConversationRef(conversationRef);
  if (!normalizedConversationRef) {
    return;
  }
  syncStates.delete(normalizedConversationRef);
  inFlightEnsures.delete(getEnsureKey(normalizedConversationRef));
}

export function invalidateConversationInferenceSessionState(): void {
  connectionEpoch += 1;
  syncStates.clear();
  inFlightEnsures.clear();
}

export async function ensureConversationInferenceSessionHydrated({
  conversationRef,
  userId,
  recordKind = 'transcript',
}: EnsureConversationInferenceSessionOptions): Promise<void> {
  const normalizedConversationRef = normalizeConversationRef(conversationRef);
  if (!normalizedConversationRef) {
    return;
  }

  const currentState = getConversationInferenceSessionState(normalizedConversationRef);
  if (currentState === 'hydrated') {
    return;
  }
  if (currentState === 'local-only') {
    markConversationInferenceSessionHydrated(normalizedConversationRef);
    return;
  }

  const ensureKey = getEnsureKey(normalizedConversationRef);
  const activeEnsure = inFlightEnsures.get(ensureKey);
  if (activeEnsure) {
    return activeEnsure;
  }

  const startingEpoch = connectionEpoch;
  const ensurePromise = (async () => {
    const snapshot = await loadLocalConversationSnapshot({
      userId: resolveUserId(userId),
      conversationRef: normalizedConversationRef,
      recordKind,
      includeReplayState: true,
    });
    setConversationWorkspaceBinding(normalizedConversationRef, snapshot.workspaceBinding);
    if (snapshot.rehydrateMessages.length > 0) {
      await ApiClient.sendRehydrateConversation(
        normalizedConversationRef,
        snapshot.rehydrateMessages,
        getConversationWorkspaceBinding(normalizedConversationRef).workspacePath || null,
      );
    }
    if (startingEpoch === connectionEpoch) {
      markConversationInferenceSessionHydrated(normalizedConversationRef);
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

export async function rehydrateConversationInferenceSession({
  conversationRef,
  messages,
}: RehydrateConversationInferenceSessionOptions): Promise<void> {
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
    markConversationInferenceSessionHydrated(normalizedConversationRef);
  }
}
