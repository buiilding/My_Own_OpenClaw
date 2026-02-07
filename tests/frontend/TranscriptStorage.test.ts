import {
  emitSessionUpdateEvent,
  persistSessionInfoToStorage,
  readSessionInfoFromStorage,
  TRANSCRIPT_SESSION_STORAGE_KEY,
} from '../../frontend/src/renderer/infrastructure/transcript/sessionInfoStorage';

describe('transcript session info storage', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  test('reads null session info when storage key is missing', () => {
    expect(readSessionInfoFromStorage()).toEqual({
      sessionId: null,
      userId: null,
    });
  });

  test('reads valid session info payload from sessionStorage', () => {
    window.sessionStorage.setItem(
      TRANSCRIPT_SESSION_STORAGE_KEY,
      JSON.stringify({ sessionId: 'session-1', userId: 'user-1' }),
    );

    expect(readSessionInfoFromStorage()).toEqual({
      sessionId: 'session-1',
      userId: 'user-1',
    });
  });

  test('returns null fields for malformed payloads', () => {
    window.sessionStorage.setItem(TRANSCRIPT_SESSION_STORAGE_KEY, '{bad json');
    expect(readSessionInfoFromStorage()).toEqual({
      sessionId: null,
      userId: null,
    });
  });

  test('returns null fields when payload types are invalid', () => {
    window.sessionStorage.setItem(
      TRANSCRIPT_SESSION_STORAGE_KEY,
      JSON.stringify({ sessionId: 123, userId: { id: 'user' } }),
    );

    expect(readSessionInfoFromStorage()).toEqual({
      sessionId: null,
      userId: null,
    });
  });

  test('persists session info payload to sessionStorage', () => {
    persistSessionInfoToStorage({ sessionId: 'session-2', userId: 'user-2' });

    expect(window.sessionStorage.getItem(TRANSCRIPT_SESSION_STORAGE_KEY)).toBe(
      JSON.stringify({ sessionId: 'session-2', userId: 'user-2' }),
    );
  });

  test('persistSessionInfoToStorage swallows storage write errors', () => {
    const originalSetItem = window.sessionStorage.setItem;
    window.sessionStorage.setItem = jest.fn(() => {
      throw new Error('set-item-failed');
    }) as any;

    expect(() => {
      persistSessionInfoToStorage({ sessionId: 'session-err', userId: 'user-err' });
    }).not.toThrow();

    window.sessionStorage.setItem = originalSetItem;
  });

  test('readSessionInfoFromStorage returns null fields when storage read throws', () => {
    const originalGetItem = window.sessionStorage.getItem;
    window.sessionStorage.getItem = jest.fn(() => {
      throw new Error('get-item-failed');
    }) as any;

    expect(readSessionInfoFromStorage()).toEqual({
      sessionId: null,
      userId: null,
    });

    window.sessionStorage.getItem = originalGetItem;
  });

  test('emits transcript-session-update custom event', () => {
    const updates: Array<{ sessionId: string | null; userId: string | null }> = [];
    const handler = (event: Event) => {
      updates.push((event as CustomEvent<{ sessionId: string | null; userId: string | null }>).detail);
    };

    window.addEventListener('transcript-session-update', handler);
    emitSessionUpdateEvent({ sessionId: 'session-3', userId: 'user-3' });
    window.removeEventListener('transcript-session-update', handler);

    expect(updates).toEqual([{ sessionId: 'session-3', userId: 'user-3' }]);
  });
});
