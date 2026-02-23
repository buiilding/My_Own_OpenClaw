import { useSyncExternalStore } from 'react';
import { getTranscriptSessionInfo } from '../../../infrastructure/transcript/TranscriptWriter';

const EMPTY_SESSION_INFO = Object.freeze({
  conversationRef: null,
  userId: null,
});

let lastSnapshot = EMPTY_SESSION_INFO;

function readSessionSnapshot() {
  const next = getTranscriptSessionInfo();
  const normalized = {
    conversationRef: next?.conversationRef || null,
    userId: next?.userId || null,
  };

  // useSyncExternalStore expects referentially stable snapshots when values are unchanged.
  if (
    lastSnapshot.conversationRef === normalized.conversationRef
    && lastSnapshot.userId === normalized.userId
  ) {
    return lastSnapshot;
  }

  lastSnapshot = normalized;
  return lastSnapshot;
}

function subscribeToSessionChanges(onStoreChange) {
  if (typeof window === 'undefined') {
    return () => undefined;
  }

  const handleSessionUpdate = () => {
    onStoreChange();
  };

  window.addEventListener('transcript-session-update', handleSessionUpdate);
  return () => window.removeEventListener('transcript-session-update', handleSessionUpdate);
}

export function useTranscriptSessionInfo() {
  return useSyncExternalStore(
    subscribeToSessionChanges,
    readSessionSnapshot,
    () => EMPTY_SESSION_INFO,
  );
}
