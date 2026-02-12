import { createTranscriptSessionState } from '../../frontend/src/renderer/infrastructure/transcript/sessionInfoState';

describe('transcript session state', () => {
  test('loads session info lazily from storage reader', () => {
    const readStoredSessionInfo = jest.fn(() => ({ conversationRef: 'conv-1', userId: 'user-1' }));
    const state = createTranscriptSessionState(readStoredSessionInfo);

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

  test('resolve ignores null override values and keeps current state', () => {
    const state = createTranscriptSessionState(() => ({ conversationRef: 'conv-1', userId: 'user-1' }));
    expect(state.resolve({ conversationRef: null, userId: null })).toEqual({
      conversationRef: 'conv-1',
      userId: 'user-1',
    });
  });
});
