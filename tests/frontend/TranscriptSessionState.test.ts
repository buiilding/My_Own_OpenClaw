import { createTranscriptSessionState } from '../../frontend/src/renderer/infrastructure/transcript/sessionInfoState';

describe('transcript session state', () => {
  test('loads session info lazily from storage reader', () => {
    const readStoredSessionInfo = jest.fn(() => ({ sessionId: 'session-1', userId: 'user-1' }));
    const state = createTranscriptSessionState(readStoredSessionInfo);

    expect(state.get()).toEqual({ sessionId: 'session-1', userId: 'user-1' });
    expect(readStoredSessionInfo).toHaveBeenCalledTimes(1);
  });

  test('resolve merges overrides on top of loaded state', () => {
    const state = createTranscriptSessionState(() => ({ sessionId: 'session-1', userId: 'user-1' }));
    expect(state.resolve({ sessionId: 'session-2' })).toEqual({
      sessionId: 'session-2',
      userId: 'user-1',
    });
  });

  test('update keeps existing user id once already known', () => {
    const state = createTranscriptSessionState(() => ({ sessionId: 'stored-session', userId: 'stored-user' }));
    expect(state.update('new-session', 'new-user')).toEqual({
      sessionId: 'new-session',
      userId: 'stored-user',
    });
  });

  test('update keeps existing session id when only user id is provided', () => {
    const state = createTranscriptSessionState(() => ({ sessionId: 'stored-session', userId: null }));
    expect(state.update(undefined, 'new-user')).toEqual({
      sessionId: 'stored-session',
      userId: 'new-user',
    });
  });

  test('resolve ignores null override values and keeps current state', () => {
    const state = createTranscriptSessionState(() => ({ sessionId: 'session-1', userId: 'user-1' }));
    expect(state.resolve({ sessionId: null, userId: null })).toEqual({
      sessionId: 'session-1',
      userId: 'user-1',
    });
  });
});
