/**
 * Covers transcript storage. behavior in the frontend test suite.
 */

import {
  emitSessionUpdateEvent,
  persistSessionInfoToStorage,
  readSessionInfoFromStorage,
} from '../../src/renderer/infrastructure/transcript/sessionInfoStorage';
import {
  createSessionUpdateRecorder,
  withTranscriptSessionUpdateListener,
} from './transcriptSessionEvent.testUtils';

const TRANSCRIPT_SESSION_STORAGE_KEY = 'transcript-session-info';

describe('transcript session info storage', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  test('reads null session info when storage key is missing', () => {
    expect(readSessionInfoFromStorage()).toEqual({
      conversationRef: null,
      userId: null,
    });
  });

  test('reads valid session info payload from sessionStorage', () => {
    window.sessionStorage.setItem(
      TRANSCRIPT_SESSION_STORAGE_KEY,
      JSON.stringify({ conversationRef: 'conv-1', userId: 'user-1' }),
    );

    expect(readSessionInfoFromStorage()).toEqual({
      conversationRef: 'conv-1',
      userId: 'user-1',
    });
  });

  test('rejects stored sessionId aliases because conversationRef owns chat identity', () => {
    window.sessionStorage.setItem(
      TRANSCRIPT_SESSION_STORAGE_KEY,
      JSON.stringify({ sessionId: 'session-1', userId: 'user-1' }),
    );

    expect(readSessionInfoFromStorage()).toEqual({
      conversationRef: null,
      userId: null,
    });
  });

  test('returns null fields for malformed payloads', () => {
    window.sessionStorage.setItem(TRANSCRIPT_SESSION_STORAGE_KEY, '{bad json');
    expect(readSessionInfoFromStorage()).toEqual({
      conversationRef: null,
      userId: null,
    });
  });

  test('returns null fields when payload types are invalid', () => {
    window.sessionStorage.setItem(
      TRANSCRIPT_SESSION_STORAGE_KEY,
      JSON.stringify({ conversationRef: 123, userId: { id: 'user' } }),
    );

    expect(readSessionInfoFromStorage()).toEqual({
      conversationRef: null,
      userId: null,
    });
  });

  test('persists session info payload to sessionStorage', () => {
    persistSessionInfoToStorage({ conversationRef: 'conv-2', userId: 'user-2' });

    expect(window.sessionStorage.getItem(TRANSCRIPT_SESSION_STORAGE_KEY)).toBe(
      JSON.stringify({ conversationRef: 'conv-2', userId: 'user-2' }),
    );
  });

  test('persistSessionInfoToStorage swallows storage write errors', () => {
    const originalSetItem = window.sessionStorage.setItem;
    window.sessionStorage.setItem = jest.fn(() => {
      throw new Error('set-item-failed');
    }) as any;

    expect(() => {
      persistSessionInfoToStorage({ conversationRef: 'conv-err', userId: 'user-err' });
    }).not.toThrow();

    window.sessionStorage.setItem = originalSetItem;
  });

  test('readSessionInfoFromStorage returns null fields when storage read throws', () => {
    const originalGetItem = window.sessionStorage.getItem;
    window.sessionStorage.getItem = jest.fn(() => {
      throw new Error('get-item-failed');
    }) as any;

    expect(readSessionInfoFromStorage()).toEqual({
      conversationRef: null,
      userId: null,
    });

    window.sessionStorage.getItem = originalGetItem;
  });

  test('emits transcript-session-update custom event', async () => {
    const { updates, handler } = createSessionUpdateRecorder();
    await withTranscriptSessionUpdateListener(handler, () => {
      emitSessionUpdateEvent({ conversationRef: 'conv-3', userId: 'user-3' });
    });

    expect(updates).toEqual([{ conversationRef: 'conv-3', userId: 'user-3' }]);
  });
});
