/**
 * Covers pending stop behavior across the shared renderer stop hook and chat store.
 */

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import { useChatStore } from '../../frontend/src/renderer/features/chat/stores/chatStore';
import { useStopTurnHandler } from '../../frontend/src/renderer/features/chat/hooks/useStopTurnHandler';
import {
  resetChatStoreForTests,
} from './chatStoreTestUtils';

const mockStop = jest.fn();
const mockSend = jest.fn();

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
    WINDIE_PENDING_TURN: 'windie:pending-turn',
  },
}));

function PendingStopButton() {
  const currentTurnProjection = useChatStore((state) => state.currentTurnProjection);
  const pendingTurn = useChatStore((state) => state.pendingTurn);
  const isSending = useChatStore((state) => state.isSending);
  const { handleStopTurn } = useStopTurnHandler({
    enabled: isSending,
    currentTurnProjection,
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

  test('stops a pending turn using the pending turn ref and clears local typing state', () => {
    useChatStore.getState().acceptPendingTurn({
      conversationRef: 'conv-pending-stop',
      turnRef: 'turn-pending-stop',
      userMessageId: 'user-pending-stop',
      text: 'pending stop',
      timestamp: '2026-06-16T00:00:00.000Z',
      attachmentFilenames: null,
    });

    render(<PendingStopButton />);
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
