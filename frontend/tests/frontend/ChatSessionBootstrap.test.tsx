/**
 * Covers chat session bootstrap. behavior in the frontend test suite.
 */

import { act, renderHook } from '@testing-library/react';
import { useChatSessionBootstrap } from '../../src/renderer/features/chat/hooks/useChatSessionBootstrap';
import { useChatStore } from '../../src/renderer/features/chat/stores/chatStore';
import { INVOKE_CHANNELS } from '../../src/renderer/infrastructure/ipc/channels';
import { DesktopTranscriptSessionRuntimeClient } from '../../src/renderer/app/runtime/desktopTranscriptSessionRuntimeClient';

jest.mock('../../src/renderer/app/runtime/desktopTranscriptSessionRuntimeClient', () => ({
  DesktopTranscriptSessionRuntimeClient: {
    setActiveConversationRef: jest.fn(),
    updateTranscriptSession: jest.fn(),
  },
}));

const mockSetActiveConversationRef = DesktopTranscriptSessionRuntimeClient.setActiveConversationRef as jest.Mock;
const mockUpdateTranscriptSession = DesktopTranscriptSessionRuntimeClient.updateTranscriptSession as jest.Mock;

describe('useChatSessionBootstrap', () => {
  beforeEach(() => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockSetActiveConversationRef.mockReset();
    mockUpdateTranscriptSession.mockReset();
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
