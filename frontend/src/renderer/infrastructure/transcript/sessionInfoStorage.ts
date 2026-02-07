import type { SessionInfo } from './types';

export const TRANSCRIPT_SESSION_STORAGE_KEY = 'transcript-session-info';

export function readSessionInfoFromStorage(): SessionInfo {
  if (typeof window === 'undefined') {
    return { sessionId: null, userId: null };
  }

  try {
    const raw = window.sessionStorage.getItem(TRANSCRIPT_SESSION_STORAGE_KEY);
    if (!raw) {
      return { sessionId: null, userId: null };
    }

    const parsed = JSON.parse(raw);
    return {
      sessionId: typeof parsed?.sessionId === 'string' ? parsed.sessionId : null,
      userId: typeof parsed?.userId === 'string' ? parsed.userId : null,
    };
  } catch (error) {
    return { sessionId: null, userId: null };
  }
}

export function persistSessionInfoToStorage(info: SessionInfo): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.sessionStorage.setItem(TRANSCRIPT_SESSION_STORAGE_KEY, JSON.stringify(info));
  } catch (error) {
    // Ignore storage errors.
  }
}

export function emitSessionUpdateEvent(info: SessionInfo): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(new CustomEvent('transcript-session-update', { detail: info }));
}
