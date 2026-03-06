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

  test('uses active transcript conversation when present', () => {
    mockGetActiveConversationRef.mockReturnValue('conv-active');
    const dispatchEvent = jest.fn();

    ingestBackendEvent({ type: 'token-count', user_id: 'user-2' } as any, 'conv-fallback', {
      syncActiveConversationProjection: jest.fn(),
      registerTurnConversationRef: jest.fn(),
      enableTranscript: true,
      dispatchEvent,
    });

    expect(mockUpdateTranscriptSession).toHaveBeenCalledWith('conv-active', 'user-2');
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
});
