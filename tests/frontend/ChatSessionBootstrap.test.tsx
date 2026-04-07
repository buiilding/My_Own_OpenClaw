import { act, renderHook } from '@testing-library/react';
import { useChatSessionBootstrap } from '../../frontend/src/renderer/features/chat/hooks/useChatSessionBootstrap';
import { useChatStore } from '../../frontend/src/renderer/features/chat/stores/chatStore';
import { INVOKE_CHANNELS } from '../../frontend/src/renderer/infrastructure/ipc/bridge';
import {
  setActiveConversationRef,
  updateTranscriptSession,
} from '../../frontend/src/renderer/infrastructure/transcript/TranscriptWriter';
import { markConversationInferenceSessionUnknown } from '../../frontend/src/renderer/features/chat/session/conversationInferenceSessionRuntime';

jest.mock('../../frontend/src/renderer/infrastructure/transcript/TranscriptWriter', () => ({
  setActiveConversationRef: jest.fn(),
  updateTranscriptSession: jest.fn(),
}));

jest.mock('../../frontend/src/renderer/features/chat/session/conversationInferenceSessionRuntime', () => ({
  markConversationInferenceSessionUnknown: jest.fn(),
}));

const mockSetActiveConversationRef = setActiveConversationRef as jest.MockedFunction<typeof setActiveConversationRef>;
const mockUpdateTranscriptSession = updateTranscriptSession as jest.MockedFunction<typeof updateTranscriptSession>;
const mockMarkConversationInferenceSessionUnknown = markConversationInferenceSessionUnknown as jest.MockedFunction<typeof markConversationInferenceSessionUnknown>;

describe('useChatSessionBootstrap', () => {
  beforeEach(() => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockSetActiveConversationRef.mockReset();
    mockUpdateTranscriptSession.mockReset();
    mockMarkConversationInferenceSessionUnknown.mockReset();
    useChatStore.setState({ activeConversationRef: null });
    (window as any).ipc = {
      send: jest.fn(),
      invoke: jest.fn().mockImplementation((channel: string) => {
        if (channel === INVOKE_CHANNELS.GET_CLIENT_USER_ID) {
          return Promise.resolve({
            conversationRef: 'conv-main-bootstrap',
            userId: 'user-main-bootstrap',
          });
        }
        return Promise.resolve({});
      }),
      on: jest.fn(),
      once: jest.fn(),
    };
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete (window as any).ipc;
  });

  test('hydrates session from main snapshot and projects active conversation', async () => {
    const { result } = renderHook(() => useChatSessionBootstrap());
    await act(async () => {
      await result.current();
    });

    expect(useChatStore.getState().activeConversationRef).toBe('conv-main-bootstrap');
    expect(mockSetActiveConversationRef).toHaveBeenCalledWith('conv-main-bootstrap');
    expect(mockUpdateTranscriptSession).toHaveBeenCalledWith('conv-main-bootstrap', 'user-main-bootstrap');
    expect(mockMarkConversationInferenceSessionUnknown).toHaveBeenCalledWith('conv-main-bootstrap');
  });

  test('returns null snapshot when main snapshot call fails', async () => {
    (window as any).ipc.invoke = jest.fn().mockRejectedValue(new Error('ipc down'));
    const { result } = renderHook(() => useChatSessionBootstrap());
    let snapshot = null;
    await act(async () => {
      snapshot = await result.current();
    });

    expect(snapshot).toEqual({ conversationRef: null, userId: null });
    expect(useChatStore.getState().activeConversationRef).toBeNull();
  });
});
