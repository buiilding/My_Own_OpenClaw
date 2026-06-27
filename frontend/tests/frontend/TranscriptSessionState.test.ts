/**
 * Covers transcript session state. behavior in the frontend test suite.
 */

import { createTranscriptSessionState } from '../../src/renderer/infrastructure/transcript/sessionInfoState';

describe('transcript session state', () => {
  test('reads from storage only once across repeated get calls', () => {
    const readStoredSessionInfo = jest.fn(() => ({ conversationRef: 'conv-1', userId: 'user-1' }));
    const state = createTranscriptSessionState(readStoredSessionInfo);

    expect(state.get()).toEqual({ conversationRef: 'conv-1', userId: 'user-1' });
    expect(state.get()).toEqual({ conversationRef: 'conv-1', userId: 'user-1' });
    expect(readStoredSessionInfo).toHaveBeenCalledTimes(1);
  });

  test('reads null session state from storage only once', () => {
    const readStoredSessionInfo = jest.fn(() => ({ conversationRef: null, userId: null }));
    const state = createTranscriptSessionState(readStoredSessionInfo);

    expect(state.get()).toEqual({ conversationRef: null, userId: null });
    expect(state.get()).toEqual({ conversationRef: null, userId: null });
    expect(state.resolve()).toEqual({ conversationRef: null, userId: null });
    expect(readStoredSessionInfo).toHaveBeenCalledTimes(1);
  });

  test('loads session info lazily from storage reader', () => {
    const readStoredSessionInfo = jest.fn(() => ({ conversationRef: 'conv-1', userId: 'user-1' }));
    const state = createTranscriptSessionState(readStoredSessionInfo);

    expect(readStoredSessionInfo).not.toHaveBeenCalled();
    expect(state.get()).toEqual({ conversationRef: 'conv-1', userId: 'user-1' });
    expect(readStoredSessionInfo).toHaveBeenCalledTimes(1);
  });

  test('resolve merges overrides on top of loaded state', () => {
    const state = createTranscriptSessionState(() => ({ conversationRef: 'conv-1', userId: 'user-1' }));
    expect(state.resolve({ conversationRef: 'conv-2' })).toEqual({
      conversationRef: 'conv-2',
      userId: 'user-1',
    });
  });

  test('update replaces conversation and user values when provided', () => {
    const state = createTranscriptSessionState(() => ({ conversationRef: 'conv-stored', userId: 'stored-user' }));
    expect(state.update('conv-new', 'new-user')).toEqual({
      conversationRef: 'conv-new',
      userId: 'new-user',
    });
  });

  test('update keeps existing conversation ref when only user id is provided', () => {
    const state = createTranscriptSessionState(() => ({ conversationRef: 'conv-stored', userId: null }));
    expect(state.update(undefined, 'new-user')).toEqual({
      conversationRef: 'conv-stored',
      userId: 'new-user',
    });
  });

  test('update keeps current user id when an empty user id is passed', () => {
    const state = createTranscriptSessionState(() => ({ conversationRef: 'conv-stored', userId: 'stored-user' }));
    expect(state.update(undefined, '')).toEqual({
      conversationRef: 'conv-stored',
      userId: 'stored-user',
    });
  });

  test('update keeps current user id when user id is undefined', () => {
    const state = createTranscriptSessionState(() => ({ conversationRef: 'conv-stored', userId: 'stored-user' }));
    expect(state.update('conv-next', undefined)).toEqual({
      conversationRef: 'conv-next',
      userId: 'stored-user',
    });
  });

  test('update clears current user id when null is explicitly provided', () => {
    const state = createTranscriptSessionState(() => ({ conversationRef: 'conv-stored', userId: 'stored-user' }));
    expect(state.update(undefined, null)).toEqual({
      conversationRef: 'conv-stored',
      userId: null,
    });
  });

  test('resolve ignores null override values and keeps current state', () => {
    const state = createTranscriptSessionState(() => ({ conversationRef: 'conv-1', userId: 'user-1' }));
    expect(state.resolve({ conversationRef: null, userId: null })).toEqual({
      conversationRef: 'conv-1',
      userId: 'user-1',
    });
  });

  test('update clears conversation ref when null is explicitly provided', () => {
    const state = createTranscriptSessionState(() => ({ conversationRef: 'conv-1', userId: 'user-1' }));
    expect(state.update(null, undefined)).toEqual({
      conversationRef: null,
      userId: 'user-1',
    });
  });
});
