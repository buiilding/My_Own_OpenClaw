/** @jest-environment node */

import {
  emitSessionUpdateEvent,
  persistSessionInfoToStorage,
  readSessionInfoFromStorage,
} from '../../frontend/src/renderer/infrastructure/transcript/sessionInfoStorage';

describe('transcript session info storage (node env)', () => {
  test('readSessionInfoFromStorage returns null fields when window is undefined', () => {
    expect(readSessionInfoFromStorage()).toEqual({
      sessionId: null,
      userId: null,
    });
  });

  test('persistSessionInfoToStorage is a no-op when window is undefined', () => {
    expect(() => {
      persistSessionInfoToStorage({ sessionId: 'session-node', userId: 'user-node' });
    }).not.toThrow();
  });

  test('emitSessionUpdateEvent is a no-op when window is undefined', () => {
    expect(() => {
      emitSessionUpdateEvent({ sessionId: 'session-node', userId: 'user-node' });
    }).not.toThrow();
  });
});
