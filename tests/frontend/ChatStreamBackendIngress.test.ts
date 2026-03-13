import { ingestBackendEvent } from '../../frontend/src/renderer/features/chat/utils/chatStream/chatStreamBackendIngress';

const mockGetActiveConversationRef = jest.fn();
const mockUpdateTranscriptSession = jest.fn();

jest.mock('../../frontend/src/renderer/infrastructure/transcript/TranscriptWriter', () => ({
  getActiveConversationRef: (...args: unknown[]) => mockGetActiveConversationRef(...args),
  updateTranscriptSession: (...args: unknown[]) => mockUpdateTranscriptSession(...args),
}));

describe('chatStreamBackendIngress', () => {
  beforeEach(() => {
    mockGetActiveConversationRef.mockReset();
    mockUpdateTranscriptSession.mockReset();
    mockGetActiveConversationRef.mockReturnValue(null);
  });

  test('syncs projection, registers turn mapping, updates transcript, and dispatches', () => {
    const syncActiveConversationProjection = jest.fn();
    const registerTurnConversationRef = jest.fn();
    const dispatchEvent = jest.fn();
    const event = { type: 'streaming-response', turn_ref: 'turn-1', user_id: 'user-1' } as any;

    ingestBackendEvent(event, 'conv-1', {
      syncActiveConversationProjection,
      registerTurnConversationRef,
      enableTranscript: true,
      dispatchEvent,
    });

    expect(syncActiveConversationProjection).toHaveBeenCalledWith(event, 'conv-1');
    expect(registerTurnConversationRef).toHaveBeenCalledWith('turn-1', 'conv-1');
    expect(mockUpdateTranscriptSession).toHaveBeenCalledWith('conv-1', 'user-1');
    expect(dispatchEvent).toHaveBeenCalledWith(event);
  });

  test('sync projection receives normalized null conversation ref for whitespace input', () => {
    const syncActiveConversationProjection = jest.fn();

    ingestBackendEvent({ type: 'streaming-response', turn_ref: 'turn-1', user_id: 'user-1' } as any, '   ', {
      syncActiveConversationProjection,
      registerTurnConversationRef: jest.fn(),
      enableTranscript: true,
      dispatchEvent: jest.fn(),
    });

    expect(syncActiveConversationProjection).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'streaming-response', turn_ref: 'turn-1' }),
      null,
    );
  });

  test('sync projection receives trimmed conversation ref', () => {
    const syncActiveConversationProjection = jest.fn();

    ingestBackendEvent({ type: 'streaming-response', turn_ref: 'turn-1', user_id: 'user-1' } as any, ' conv-1 ', {
      syncActiveConversationProjection,
      registerTurnConversationRef: jest.fn(),
      enableTranscript: true,
      dispatchEvent: jest.fn(),
    });

    expect(syncActiveConversationProjection).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'streaming-response', turn_ref: 'turn-1' }),
      'conv-1',
    );
  });

  test('registers turn mapping with trimmed turn and conversation refs', () => {
    const registerTurnConversationRef = jest.fn();

    ingestBackendEvent({ type: 'streaming-response', turn_ref: ' turn-1 ', user_id: 'user-1' } as any, ' conv-1 ', {
      syncActiveConversationProjection: jest.fn(),
      registerTurnConversationRef,
      enableTranscript: true,
      dispatchEvent: jest.fn(),
    });

    expect(registerTurnConversationRef).toHaveBeenCalledWith('turn-1', 'conv-1');
  });

  test('keeps the active transcript conversation for non-local backend events', () => {
    mockGetActiveConversationRef.mockReturnValue('conv-active');
    const dispatchEvent = jest.fn();

    ingestBackendEvent({ type: 'token-count', user_id: 'user-2' } as any, 'conv-event', {
      syncActiveConversationProjection: jest.fn(),
      registerTurnConversationRef: jest.fn(),
      enableTranscript: true,
      dispatchEvent,
    });

    expect(mockUpdateTranscriptSession).toHaveBeenCalledWith('conv-active', 'user-2');
  });

  test('local-user-message promotes its explicit conversation over a stale active transcript conversation', () => {
    mockGetActiveConversationRef.mockReturnValue('conv-active');
    const dispatchEvent = jest.fn();

    ingestBackendEvent({ type: 'local-user-message', user_id: 'user-2' } as any, 'conv-event', {
      syncActiveConversationProjection: jest.fn(),
      registerTurnConversationRef: jest.fn(),
      enableTranscript: true,
      dispatchEvent,
    });

    expect(mockUpdateTranscriptSession).toHaveBeenCalledWith('conv-event', 'user-2');
  });

  test('uses active transcript conversation when resolved event conversation is missing', () => {
    mockGetActiveConversationRef.mockReturnValue('conv-active');
    const dispatchEvent = jest.fn();

    ingestBackendEvent({ type: 'token-count', user_id: 'user-2' } as any, null, {
      syncActiveConversationProjection: jest.fn(),
      registerTurnConversationRef: jest.fn(),
      enableTranscript: true,
      dispatchEvent,
    });

    expect(mockUpdateTranscriptSession).toHaveBeenCalledWith('conv-active', 'user-2');
  });

  test('uses trimmed active transcript conversation when resolved event conversation is missing', () => {
    mockGetActiveConversationRef.mockReturnValue(' conv-active ');
    const dispatchEvent = jest.fn();

    ingestBackendEvent({ type: 'token-count', user_id: 'user-2' } as any, null, {
      syncActiveConversationProjection: jest.fn(),
      registerTurnConversationRef: jest.fn(),
      enableTranscript: true,
      dispatchEvent,
    });

    expect(mockUpdateTranscriptSession).toHaveBeenCalledWith('conv-active', 'user-2');
  });

  test('ignores whitespace active transcript conversation and falls back to resolved conversation', () => {
    mockGetActiveConversationRef.mockReturnValue('   ');
    const dispatchEvent = jest.fn();

    ingestBackendEvent({ type: 'token-count', user_id: 'user-2' } as any, 'conv-fallback', {
      syncActiveConversationProjection: jest.fn(),
      registerTurnConversationRef: jest.fn(),
      enableTranscript: true,
      dispatchEvent,
    });

    expect(mockUpdateTranscriptSession).toHaveBeenCalledWith('conv-fallback', 'user-2');
  });

  test('does not register turn mapping when conversation ref is missing', () => {
    const registerTurnConversationRef = jest.fn();

    ingestBackendEvent({ type: 'streaming-response', turn_ref: 'turn-2', user_id: 'user-2' } as any, null, {
      syncActiveConversationProjection: jest.fn(),
      registerTurnConversationRef,
      enableTranscript: true,
      dispatchEvent: jest.fn(),
    });

    expect(registerTurnConversationRef).not.toHaveBeenCalled();
  });

  test('does not register turn mapping when turn ref is missing', () => {
    const registerTurnConversationRef = jest.fn();

    ingestBackendEvent({ type: 'streaming-response', user_id: 'user-2' } as any, 'conv-2', {
      syncActiveConversationProjection: jest.fn(),
      registerTurnConversationRef,
      enableTranscript: true,
      dispatchEvent: jest.fn(),
    });

    expect(registerTurnConversationRef).not.toHaveBeenCalled();
  });

  test('does not register turn mapping when conversation ref is whitespace', () => {
    const registerTurnConversationRef = jest.fn();

    ingestBackendEvent({ type: 'streaming-response', turn_ref: 'turn-2', user_id: 'user-2' } as any, '   ', {
      syncActiveConversationProjection: jest.fn(),
      registerTurnConversationRef,
      enableTranscript: true,
      dispatchEvent: jest.fn(),
    });

    expect(registerTurnConversationRef).not.toHaveBeenCalled();
  });

  test('does not register turn mapping when turn ref is whitespace', () => {
    const registerTurnConversationRef = jest.fn();

    ingestBackendEvent({ type: 'streaming-response', turn_ref: '   ', user_id: 'user-2' } as any, 'conv-2', {
      syncActiveConversationProjection: jest.fn(),
      registerTurnConversationRef,
      enableTranscript: true,
      dispatchEvent: jest.fn(),
    });

    expect(registerTurnConversationRef).not.toHaveBeenCalled();
  });

  test('continues dispatch when projection sync throws', () => {
    const syncActiveConversationProjection = jest.fn(() => {
      throw new Error('projection failed');
    });
    const dispatchEvent = jest.fn();
    const event = { type: 'streaming-response', turn_ref: 'turn-proj', user_id: 'user-proj' } as any;

    expect(() => ingestBackendEvent(event, 'conv-proj', {
      syncActiveConversationProjection,
      registerTurnConversationRef: jest.fn(),
      enableTranscript: true,
      dispatchEvent,
    })).not.toThrow();

    expect(dispatchEvent).toHaveBeenCalledWith(event);
  });

  test('continues turn-map and transcript processing when projection sync throws', () => {
    const syncActiveConversationProjection = jest.fn(() => {
      throw new Error('projection failed');
    });
    const registerTurnConversationRef = jest.fn();
    const dispatchEvent = jest.fn();
    const event = { type: 'streaming-response', turn_ref: 'turn-proj-chain', user_id: 'user-proj-chain' } as any;

    expect(() => ingestBackendEvent(event, 'conv-proj-chain', {
      syncActiveConversationProjection,
      registerTurnConversationRef,
      enableTranscript: true,
      dispatchEvent,
    })).not.toThrow();

    expect(registerTurnConversationRef).toHaveBeenCalledWith('turn-proj-chain', 'conv-proj-chain');
    expect(mockUpdateTranscriptSession).toHaveBeenCalledWith('conv-proj-chain', 'user-proj-chain');
    expect(dispatchEvent).toHaveBeenCalledWith(event);
  });

  test('continues dispatch and transcript sync when turn-map registration throws', () => {
    const registerTurnConversationRef = jest.fn(() => {
      throw new Error('turn-map failed');
    });
    const dispatchEvent = jest.fn();
    const event = { type: 'streaming-response', turn_ref: 'turn-map', user_id: 'user-map' } as any;

    expect(() => ingestBackendEvent(event, 'conv-map', {
      syncActiveConversationProjection: jest.fn(),
      registerTurnConversationRef,
      enableTranscript: true,
      dispatchEvent,
    })).not.toThrow();

    expect(mockUpdateTranscriptSession).toHaveBeenCalledWith('conv-map', 'user-map');
    expect(dispatchEvent).toHaveBeenCalledWith(event);
  });

  test('runs ingress bookkeeping before dispatching event handlers', () => {
    const syncActiveConversationProjection = jest.fn();
    const registerTurnConversationRef = jest.fn();
    const dispatchEvent = jest.fn();
    const event = { type: 'streaming-response', turn_ref: 'turn-order', user_id: 'user-order' } as any;

    ingestBackendEvent(event, 'conv-order', {
      syncActiveConversationProjection,
      registerTurnConversationRef,
      enableTranscript: true,
      dispatchEvent,
    });

    const syncOrder = syncActiveConversationProjection.mock.invocationCallOrder[0];
    const turnMapOrder = registerTurnConversationRef.mock.invocationCallOrder[0];
    const transcriptOrder = mockUpdateTranscriptSession.mock.invocationCallOrder[0];
    const dispatchOrder = dispatchEvent.mock.invocationCallOrder[0];

    expect(syncOrder).toBeLessThan(dispatchOrder);
    expect(turnMapOrder).toBeLessThan(dispatchOrder);
    expect(transcriptOrder).toBeLessThan(dispatchOrder);
  });

  test('skips transcript update when transcript is disabled', () => {
    ingestBackendEvent({ type: 'error', user_id: 'user-3' } as any, null, {
      syncActiveConversationProjection: jest.fn(),
      registerTurnConversationRef: jest.fn(),
      enableTranscript: false,
      dispatchEvent: jest.fn(),
    });

    expect(mockUpdateTranscriptSession).not.toHaveBeenCalled();
  });

  test('uses undefined transcript fallback when no active or resolved conversation ref exists', () => {
    mockGetActiveConversationRef.mockReturnValue(null);

    ingestBackendEvent({ type: 'token-count', user_id: 'user-none' } as any, null, {
      syncActiveConversationProjection: jest.fn(),
      registerTurnConversationRef: jest.fn(),
      enableTranscript: true,
      dispatchEvent: jest.fn(),
    });

    expect(mockUpdateTranscriptSession).toHaveBeenCalledWith(undefined, 'user-none');
  });

  test('uses undefined transcript fallback when resolved conversation ref is whitespace', () => {
    mockGetActiveConversationRef.mockReturnValue(null);

    ingestBackendEvent({ type: 'token-count', user_id: 'user-none' } as any, '   ', {
      syncActiveConversationProjection: jest.fn(),
      registerTurnConversationRef: jest.fn(),
      enableTranscript: true,
      dispatchEvent: jest.fn(),
    });

    expect(mockUpdateTranscriptSession).toHaveBeenCalledWith(undefined, 'user-none');
  });

  test('continues dispatch when transcript session update throws', () => {
    mockUpdateTranscriptSession.mockImplementation(() => {
      throw new Error('transcript write failed');
    });
    const dispatchEvent = jest.fn();
    const event = { type: 'streaming-response', turn_ref: 'turn-err', user_id: 'user-err' } as any;

    expect(() => ingestBackendEvent(event, 'conv-err', {
      syncActiveConversationProjection: jest.fn(),
      registerTurnConversationRef: jest.fn(),
      enableTranscript: true,
      dispatchEvent,
    })).not.toThrow();

    expect(dispatchEvent).toHaveBeenCalledWith(event);
  });

  test('keeps projection and turn-map bookkeeping when transcript update throws', () => {
    mockUpdateTranscriptSession.mockImplementation(() => {
      throw new Error('transcript write failed');
    });
    const syncActiveConversationProjection = jest.fn();
    const registerTurnConversationRef = jest.fn();
    const dispatchEvent = jest.fn();
    const event = { type: 'streaming-response', turn_ref: 'turn-transcript-err', user_id: 'user-transcript-err' } as any;

    expect(() => ingestBackendEvent(event, 'conv-transcript-err', {
      syncActiveConversationProjection,
      registerTurnConversationRef,
      enableTranscript: true,
      dispatchEvent,
    })).not.toThrow();

    expect(syncActiveConversationProjection).toHaveBeenCalledWith(event, 'conv-transcript-err');
    expect(registerTurnConversationRef).toHaveBeenCalledWith('turn-transcript-err', 'conv-transcript-err');
    expect(dispatchEvent).toHaveBeenCalledWith(event);
  });
});
