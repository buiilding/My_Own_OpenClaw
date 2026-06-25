/**
 * Covers pending stop behavior across the shared renderer stop hook and chat store.
 */

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { useShallow } from 'zustand/react/shallow';

import { AppConfigContext } from '../../frontend/src/renderer/app/providers/AppConfigContext';
import {
  selectLiveTurnSurfaceState,
  useChatStore,
} from '../../frontend/src/renderer/features/chat/stores/chatStore';
import { useChatSurfaceController } from '../../frontend/src/renderer/features/chat/hooks/useChatSurfaceController';
import { useStopTurnHandler } from '../../frontend/src/renderer/features/chat/hooks/useStopTurnHandler';
import {
  resetChatStoreForTests,
} from './chatStoreTestUtils';

const mockStop = jest.fn();
const mockSend = jest.fn();
const mockRunManualCompaction = jest.fn();

jest.mock('../../frontend/src/renderer/app/runtime/desktopLiveTurnRuntimeClient', () => ({
  DesktopLiveTurnRuntimeClient: {
    stop: (...args) => mockStop(...args),
  },
}));

jest.mock('../../frontend/src/renderer/infrastructure/ipc/bridge', () => ({
  IpcBridge: {
    send: (...args) => mockSend(...args),
  },
  SEND_CHANNELS: {
    DESKTOP_RUNTIME_PENDING_TURN: 'windie:pending-turn',
  },
}));

jest.mock('../../frontend/src/renderer/app/runtime/desktopManualCompactionRuntime', () => ({
  DesktopManualCompactionRuntime: {
    runManualCompaction: (...args) => mockRunManualCompaction(...args),
  },
}));

function PendingStopButton() {
  const chatSurfaceState = useChatStore(useShallow(selectLiveTurnSurfaceState));
  const { pendingTurn } = chatSurfaceState;
  const chatSurface = useChatSurfaceController({
    chatSurfaceState,
    sessionInfo: {
      conversationRef: 'conv-pending-stop',
      userId: 'user-pending-stop',
    },
    setThinkingStatus: jest.fn(),
    setThinkingSourceEventType: jest.fn(),
    warningContext: 'PendingStopLiveSurfaceIntegration',
  });
  const { handleStopTurn } = useStopTurnHandler({
    enabled: chatSurface.isBusy,
    pendingTurn,
    sessionConversationRef: 'conv-pending-stop',
    warningContext: 'PendingStopLiveSurfaceIntegration',
  });
  return (
    <button type="button" onClick={handleStopTurn}>
      Stop
    </button>
  );
}

describe('pending stop live surface integration', () => {
  beforeEach(() => {
    resetChatStoreForTests(null);
    mockStop.mockClear();
    mockSend.mockClear();
  });

  test('stops a pending turn from visible lifecycle when raw isSending is stale false', () => {
    useChatStore.getState().acceptPendingTurn({
      conversationRef: 'conv-pending-stop',
      turnRef: 'turn-pending-stop',
      userMessageId: 'user-pending-stop',
      text: 'pending stop',
      timestamp: '2026-06-16T00:00:00.000Z',
      attachmentFilenames: null,
    });
    useChatStore.setState({ isSending: false });

    render(
      <AppConfigContext.Provider value={{
        config: {
          speech_mode_enabled: false,
          wakeword_stt_enabled: false,
          include_query_screenshot: true,
        },
        updateConfig: jest.fn(),
      }}
      >
        <PendingStopButton />
      </AppConfigContext.Provider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));

    expect(mockStop).toHaveBeenCalledWith('conv-pending-stop', 'turn-pending-stop');
    expect(mockSend).toHaveBeenCalledWith('windie:pending-turn', {
      type: 'clear',
      conversationRef: 'conv-pending-stop',
      turnRef: 'turn-pending-stop',
    });
    expect(useChatStore.getState()).toEqual(expect.objectContaining({
      pendingTurn: null,
      isSending: false,
      thinkingStatus: null,
      thinkingSourceEventType: null,
    }));
    expect(useChatStore.getState().streamTracking).toEqual(expect.objectContaining({
      phase: 'complete',
      lastEventType: 'stop-query',
    }));
  });
});
