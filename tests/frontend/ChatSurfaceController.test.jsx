/**
 * Covers chat surface controller. behavior in the frontend test suite.
 */

import React from 'react';
import { act, renderHook } from '@testing-library/react';
import { AppConfigContext } from '../../frontend/src/renderer/app/providers/AppConfigContext';
import { useChatSurfaceController } from '../../frontend/src/renderer/features/chat/hooks/useChatSurfaceController';

const mockCurrentTurnPresentationState = jest.fn();
const mockRunManualCompaction = jest.fn();

jest.mock('../../frontend/src/renderer/features/chat/hooks/useCurrentTurnPresentationState', () => ({
  useCurrentTurnPresentationState: (...args) => mockCurrentTurnPresentationState(...args),
}));

jest.mock('../../frontend/src/renderer/app/runtime/desktopManualCompactionRuntime', () => ({
  runManualCompaction: (...args) => mockRunManualCompaction(...args),
}));

function renderController({
  config = {
    speech_mode_enabled: false,
    wakeword_stt_enabled: true,
    include_query_screenshot: true,
  },
  updateConfig = jest.fn(),
  presentationState = { isBusy: false, awaitingDotTargetMessageId: null },
  props = {},
} = {}) {
  mockCurrentTurnPresentationState.mockReturnValue(presentationState);

  const wrapper = ({ children }) => (
    <AppConfigContext.Provider value={{ config, updateConfig }}>
      {children}
    </AppConfigContext.Provider>
  );

    const hook = renderHook(() => useChatSurfaceController({
    isSending: false,
    messages: [{ id: 'user-1', type: 'user', sender: 'user', text: 'hello' }],
    currentTurnProjection: {
      phase: 'streaming',
      conversationRef: 'conv-1',
      turnRef: 'turn-1',
      assistantText: '',
      reasoningText: null,
      toolEvents: [],
      lastError: null,
    },
    sessionInfo: {
      conversationRef: 'conv-1',
      userId: 'user-1',
    },
    setThinkingStatus: jest.fn(),
    setThinkingSourceEventType: jest.fn(),
    warningContext: 'ControllerTest',
    ...props,
  }), { wrapper });

  return {
    ...hook,
    updateConfig,
  };
}

describe('useChatSurfaceController', () => {
  beforeEach(() => {
    mockCurrentTurnPresentationState.mockReset();
    mockRunManualCompaction.mockReset();
    mockRunManualCompaction.mockResolvedValue(undefined);
  });

  test('derives shared surface flags and current-turn state', () => {
    const { result } = renderController({
      config: {
        speech_mode_enabled: true,
        wakeword_stt_enabled: true,
        include_query_screenshot: false,
      },
      presentationState: {
        isBusy: true,
        awaitingDotTargetMessageId: 'assistant-1',
      },
    });

    expect(result.current.speechModeEnabled).toBe(true);
    expect(result.current.wakewordSttEnabled).toBe(true);
    expect(result.current.includeQueryScreenshot).toBe(false);
    expect(result.current.isBusy).toBe(true);
    expect(result.current.canStop).toBe(true);
    expect(result.current.currentTurnPresentationState.awaitingDotTargetMessageId).toBe('assistant-1');
    expect(mockCurrentTurnPresentationState).toHaveBeenCalledWith(expect.objectContaining({
      phase: 'streaming',
      isSending: true,
    }));
  });

  test('prefers SDK current-turn completion over stale stream phases', () => {
    renderController({
      props: {
        phase: 'tool-output',
        streamTracking: { phase: 'tool-output' },
        currentTurnProjection: {
          phase: 'complete',
          conversationRef: 'conv-1',
          turnRef: 'turn-1',
          assistantText: 'done',
          reasoningText: null,
          toolEvents: [],
          lastError: null,
        },
      },
    });

    expect(mockCurrentTurnPresentationState).toHaveBeenCalledWith(expect.objectContaining({
      phase: 'complete',
      isSending: false,
    }));
  });

  test('uses SDK awaiting anchor as dashboard typing dot target', () => {
    const { result } = renderController({
      presentationState: {
        isBusy: true,
        awaitingDotTargetMessageId: 'legacy-user-row',
      },
      props: {
        currentTurnProjection: {
          phase: 'awaiting',
          conversationRef: 'conv-1',
          turnRef: 'turn-1',
          userMessageRowId: 'user-row-1',
          assistantText: '',
          reasoningText: null,
          toolEvents: [],
          lastError: null,
          presentation: {
            conversationRef: 'conv-1',
            turnRef: 'turn-1',
            phase: 'awaiting',
            entries: [],
            hasVisibleContent: false,
            typingVisible: true,
            overlayVisible: true,
            isBusy: true,
            isTerminal: false,
            lastError: null,
            awaitingAnchor: {
              kind: 'user-message',
              rowId: 'user-row-1',
              turnRef: 'turn-1',
              conversationRef: 'conv-1',
            },
            overlayIntent: {
              visible: true,
              mode: 'awaiting',
              turnRef: 'turn-1',
              conversationRef: 'conv-1',
              staleGuardRef: 'turn-1',
            },
          },
        },
      },
    });

    expect(result.current.currentTurnPresentationState).toMatchObject({
      loopUiState: 'awaiting-reply',
      showAssistantAwaitingDot: true,
      awaitingDotTargetMessageId: 'user-row-1',
      showChatboxAwaitingReply: true,
      showChatboxResponse: false,
    });
  });

  test('keeps local send preflight busy when SDK presentation is hidden', () => {
    const { result } = renderController({
      presentationState: {
        isBusy: true,
        showChatboxAwaitingReply: true,
        awaitingDotTargetMessageId: null,
      },
      props: {
        isSending: true,
        messages: [
          { id: 'user-2', type: 'user', sender: 'user', text: 'second', turnRef: 'turn-2' },
        ],
        currentTurnProjection: {
          phase: 'awaiting',
          conversationRef: 'conv-1',
          turnRef: 'turn-2',
          userMessageRowId: 'user-row-2',
          assistantText: '',
          reasoningText: null,
          toolEvents: [],
          lastError: null,
          presentation: {
            conversationRef: 'conv-1',
            turnRef: 'turn-2',
            phase: 'awaiting',
            entries: [],
            hasVisibleContent: false,
            typingVisible: false,
            overlayVisible: false,
            isBusy: false,
            isTerminal: false,
            lastError: null,
            overlayIntent: {
              visible: false,
              mode: 'hidden',
              turnRef: 'turn-2',
              conversationRef: 'conv-1',
              staleGuardRef: 'turn-2',
            },
          },
        },
      },
    });

    expect(mockCurrentTurnPresentationState).toHaveBeenCalledWith(expect.objectContaining({
      phase: 'awaiting-first-chunk',
      isSending: true,
    }));
    expect(result.current).toMatchObject({
      isBusy: true,
      canStop: true,
      liveTurnPhase: 'awaiting-first-chunk',
      liveTurnSource: 'send-preflight',
    });
    expect(result.current.currentTurnPresentationState).toMatchObject({
      showChatboxAwaitingReply: true,
    });
  });

  test('keeps local send preflight busy before optimistic user row lands', () => {
    const { result } = renderController({
      presentationState: {
        isBusy: true,
        showChatboxAwaitingReply: true,
        awaitingDotTargetMessageId: null,
      },
      props: {
        isSending: true,
        messages: [
          { id: 'user-1', type: 'user', sender: 'user', text: 'first', turnRef: 'turn-1' },
          {
            id: 'assistant-1',
            type: 'llm-text',
            sender: 'assistant',
            text: 'previous complete response',
            turnRef: 'turn-1',
          },
        ],
        currentTurnProjection: {
          phase: 'complete',
          conversationRef: 'conv-1',
          turnRef: 'turn-1',
          assistantText: 'previous complete response',
          reasoningText: null,
          toolEvents: [],
          lastError: null,
        },
      },
    });

    expect(mockCurrentTurnPresentationState).toHaveBeenCalledWith(expect.objectContaining({
      phase: 'awaiting-first-chunk',
      isSending: true,
    }));
    expect(result.current).toMatchObject({
      isBusy: true,
      canStop: true,
      liveTurnSource: 'send-preflight',
    });
  });

  test('runs pill and dashboard config toggles through one busy gate', () => {
    const { result, updateConfig, rerender } = renderController();

    act(() => {
      expect(result.current.toggleSpeechMode()).toBe(true);
      expect(result.current.toggleQueryScreenshot()).toBe(true);
    });

    expect(updateConfig).toHaveBeenCalledWith({ speech_mode_enabled: true });
    expect(updateConfig).toHaveBeenCalledWith({ include_query_screenshot: false });

    mockCurrentTurnPresentationState.mockReturnValue({ isBusy: true });
    rerender();

    act(() => {
      expect(result.current.toggleSpeechMode()).toBe(false);
      expect(result.current.toggleQueryScreenshot()).toBe(false);
    });

    expect(updateConfig).toHaveBeenCalledTimes(2);
  });

  test('runs manual compaction with active conversation context when idle', async () => {
    const setThinkingStatus = jest.fn();
    const setThinkingSourceEventType = jest.fn();
    const { result } = renderController({
      props: {
        sessionInfo: {
          conversationRef: 'conv-active',
          userId: 'user-active',
        },
        setThinkingStatus,
        setThinkingSourceEventType,
      },
    });

    await act(async () => {
      await expect(result.current.runManualCompaction()).resolves.toBe(true);
    });

    expect(mockRunManualCompaction).toHaveBeenCalledWith(expect.objectContaining({
      conversationRef: 'conv-active',
      userId: 'user-active',
      setThinkingStatus,
      setThinkingSourceEventType,
      warningContext: 'ControllerTest',
    }));
  });

  test('blocks manual compaction while the shared surface is busy', async () => {
    const { result } = renderController({
      presentationState: {
        isBusy: true,
      },
    });

    await act(async () => {
      await expect(result.current.runManualCompaction()).resolves.toBe(false);
    });

    expect(mockRunManualCompaction).not.toHaveBeenCalled();
  });

  test('allows dashboard-style manual compaction during active turns when requested', async () => {
    const { result } = renderController({
      presentationState: {
        isBusy: true,
      },
      props: {
        allowManualCompactionWhileBusy: true,
      },
    });

    await act(async () => {
      await expect(result.current.runManualCompaction()).resolves.toBe(true);
    });

    expect(mockRunManualCompaction).toHaveBeenCalledTimes(1);
  });
});
