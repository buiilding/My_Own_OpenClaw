import { DesktopConversationContinuityService } from '../../frontend/src/renderer/app/runtime/desktopConversationContinuityService';
import {
  clearConversationInferenceSessionState,
  ensureConversationInferenceSessionHydrated,
  getConversationInferenceSessionState,
  invalidateConversationInferenceSessionState,
  markConversationInferenceSessionLocalOnly,
  markConversationInferenceSessionUnknown,
  rehydrateConversationInferenceSession,
} from '../../frontend/src/renderer/features/chat/session/conversationInferenceSessionRuntime';

jest.mock('../../frontend/src/renderer/app/runtime/desktopConversationContinuityService', () => ({
  DesktopConversationContinuityService: {
    loadLocalConversationSnapshot: jest.fn(),
    rehydrateFromStore: jest.fn(),
    rehydrateMessages: jest.fn(),
  },
}));

const mockContinuityService = DesktopConversationContinuityService as jest.Mocked<typeof DesktopConversationContinuityService>;

function mockLocalSnapshot() {
  mockContinuityService.loadLocalConversationSnapshot.mockResolvedValue({
    transcriptEntries: [],
    replayEntries: [],
    workspaceBinding: {
      workspacePath: '',
      workspaceName: '',
    },
    parsedMessages: [],
    rehydrateMessages: [],
  });
}

describe('conversationInferenceSessionRuntime', () => {
  beforeEach(() => {
    invalidateConversationInferenceSessionState();
    mockContinuityService.rehydrateFromStore.mockReset();
    mockContinuityService.rehydrateMessages.mockReset();
    mockContinuityService.loadLocalConversationSnapshot.mockReset();
    mockLocalSnapshot();
  });

  test('lazy rehydrates an unknown existing conversation once and then treats it as synced', async () => {
    markConversationInferenceSessionUnknown('conv-existing');
    mockContinuityService.rehydrateFromStore.mockResolvedValueOnce(undefined);

    await ensureConversationInferenceSessionHydrated({
      conversationRef: 'conv-existing',
      userId: 'user-1',
    });
    await ensureConversationInferenceSessionHydrated({
      conversationRef: 'conv-existing',
      userId: 'user-1',
    });

    expect(mockContinuityService.loadLocalConversationSnapshot).toHaveBeenCalledTimes(1);
    expect(mockContinuityService.loadLocalConversationSnapshot).toHaveBeenCalledWith(expect.objectContaining({
      recordKind: 'chat_event',
    }));
    expect(mockContinuityService.rehydrateFromStore).toHaveBeenCalledTimes(1);
    expect(mockContinuityService.rehydrateFromStore).toHaveBeenCalledWith(expect.objectContaining({
      conversationRef: 'conv-existing',
      userId: 'user-1',
      workspacePath: null,
    }));
    expect(mockContinuityService.rehydrateMessages).not.toHaveBeenCalled();
    expect(getConversationInferenceSessionState('conv-existing')).toBe('hydrated');
  });

  test('uses runtime rehydrate snapshots when available', async () => {
    markConversationInferenceSessionUnknown('conv-replay-preferred');
    mockContinuityService.rehydrateFromStore.mockResolvedValueOnce(undefined);

    await ensureConversationInferenceSessionHydrated({
      conversationRef: 'conv-replay-preferred',
      userId: 'user-1',
    });

    expect(mockContinuityService.rehydrateFromStore).toHaveBeenCalledWith(expect.objectContaining({
      conversationRef: 'conv-replay-preferred',
      userId: 'user-1',
      workspacePath: null,
    }));
  });

  test('uses canonical SDK conversation events for backend rehydrate when available', async () => {
    markConversationInferenceSessionUnknown('conv-sdk-events');
    mockContinuityService.rehydrateFromStore.mockResolvedValueOnce(undefined);

    await ensureConversationInferenceSessionHydrated({
      conversationRef: 'conv-sdk-events',
      userId: 'user-1',
    });

    expect(mockContinuityService.rehydrateFromStore).toHaveBeenCalledTimes(1);
    expect(mockContinuityService.rehydrateFromStore).toHaveBeenCalledWith(expect.objectContaining({
      conversationRef: 'conv-sdk-events',
      userId: 'user-1',
      workspacePath: null,
    }));
  });

  test('skips transcript loading and backend rehydrate for fresh local conversations', async () => {
    markConversationInferenceSessionLocalOnly('conv-fresh');

    await ensureConversationInferenceSessionHydrated({
      conversationRef: 'conv-fresh',
      userId: 'user-1',
    });

    expect(mockContinuityService.loadLocalConversationSnapshot).not.toHaveBeenCalled();
    expect(mockContinuityService.rehydrateFromStore).not.toHaveBeenCalled();
    expect(mockContinuityService.rehydrateMessages).not.toHaveBeenCalled();
    expect(getConversationInferenceSessionState('conv-fresh')).toBe('hydrated');
  });

  test('explicit replay rehydrate always sends the backend replacement payload, even when empty', async () => {
    await rehydrateConversationInferenceSession({
      conversationRef: 'conv-replay',
      messages: [],
    });

    expect(mockContinuityService.rehydrateMessages).toHaveBeenCalledWith({
      conversationRef: 'conv-replay',
      messages: [],
      workspacePath: null,
    });
    expect(getConversationInferenceSessionState('conv-replay')).toBe('hydrated');
  });

  test('invalidating sync state forces a later ensure to rehydrate again', async () => {
    markConversationInferenceSessionUnknown('conv-reconnect');
    mockContinuityService.rehydrateFromStore.mockResolvedValue(undefined);

    await ensureConversationInferenceSessionHydrated({
      conversationRef: 'conv-reconnect',
      userId: 'user-1',
    });

    invalidateConversationInferenceSessionState();
    markConversationInferenceSessionUnknown('conv-reconnect');

    await ensureConversationInferenceSessionHydrated({
      conversationRef: 'conv-reconnect',
      userId: 'user-1',
    });

    expect(mockContinuityService.rehydrateFromStore).toHaveBeenCalledTimes(2);
  });

  test('clearing a conversation removes its sync state record', () => {
    markConversationInferenceSessionLocalOnly('conv-clear');

    clearConversationInferenceSessionState('conv-clear');

    expect(getConversationInferenceSessionState('conv-clear')).toBeNull();
  });
});
