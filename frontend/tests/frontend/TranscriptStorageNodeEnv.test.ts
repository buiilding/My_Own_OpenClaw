/** @jest-environment node */

import {
  emitSessionUpdateEvent,
  persistSessionInfoToStorage,
  readSessionInfoFromStorage,
} from '../../src/renderer/infrastructure/transcript/sessionInfoStorage';

describe('transcript session info storage (node env)', () => {
  test('readSessionInfoFromStorage returns null fields when window is undefined', () => {
    expect(readSessionInfoFromStorage()).toEqual({
      conversationRef: null,
      userId: null,
    });
  });

  test('persistSessionInfoToStorage is a no-op when window is undefined', () => {
    expect(() => {
      persistSessionInfoToStorage({ conversationRef: 'conv-node', userId: 'user-node' });
    }).not.toThrow();
  });

  test('emitSessionUpdateEvent is a no-op when window is undefined', () => {
    expect(() => {
      emitSessionUpdateEvent({ conversationRef: 'conv-node', userId: 'user-node' });
    }).not.toThrow();
  });
});
