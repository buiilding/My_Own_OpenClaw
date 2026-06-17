/**
 * Provides the session info storage module for the renderer UI.
 */

import type { SessionInfo } from './types';

const TRANSCRIPT_SESSION_STORAGE_KEY = 'transcript-session-info';

function hasRemovedSessionIdentityKey(value: unknown): boolean {
  return Boolean(
    value
      && typeof value === 'object'
      && !Array.isArray(value)
      && (
        Object.prototype.hasOwnProperty.call(value, 'sessionId')
        || Object.prototype.hasOwnProperty.call(value, 'session_id')
      ),
  );
}

export function readSessionInfoFromStorage(): SessionInfo {
  if (typeof window === 'undefined') {
    return { conversationRef: null, userId: null };
  }

  try {
    const raw = window.sessionStorage.getItem(TRANSCRIPT_SESSION_STORAGE_KEY);
    if (!raw) {
      return { conversationRef: null, userId: null };
    }

    const parsed = JSON.parse(raw);
    if (hasRemovedSessionIdentityKey(parsed)) {
      return { conversationRef: null, userId: null };
    }
    return {
      conversationRef: typeof parsed?.conversationRef === 'string' ? parsed.conversationRef : null,
      userId: typeof parsed?.userId === 'string' ? parsed.userId : null,
    };
  } catch (_error) {
    return { conversationRef: null, userId: null };
  }
}

export function persistSessionInfoToStorage(info: SessionInfo): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.sessionStorage.setItem(TRANSCRIPT_SESSION_STORAGE_KEY, JSON.stringify(info));
  } catch (_error) {
    // Ignore storage errors.
  }
}

export function emitSessionUpdateEvent(info: SessionInfo): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(new CustomEvent('transcript-session-update', { detail: info }));
}
