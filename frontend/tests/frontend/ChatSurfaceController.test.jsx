/**
 * Covers chat surface controller. behavior in the frontend test suite.
 */

import React from 'react';
import { act, renderHook } from '@testing-library/react';
import { AppConfigContext } from '../../src/renderer/app/providers/AppConfigContext';
import { useChatSurfaceController } from '../../src/renderer/features/chat/hooks/useChatSurfaceController';

const mockRunManualCompaction = jest.fn();

jest.mock('../../src/renderer/app/runtime/desktopManualCompactionRuntime', () => ({
  DesktopManualCompactionRuntime: {
    runManualCompaction: (...args) => mockRunManualCompaction(...args),
  },
}));

function renderController({
  config = {
    speech_mode_enabled: false,
    wakeword_stt_enabled: true,
    include_query_screenshot: true,
  },
  updateConfig = jest.fn(),
  props = {},
} = {}) {
  const {
    messages = [{ id: 'user-1', type: 'user', sender: 'user', text: 'hello' }],
    sdkLiveTurn = {
      phase: 'streaming',
      conversationRef: 'conv-1',
      turnRef: 'turn-1',
      assistantText: 'streaming response',
      reasoningText: null,
      toolEvents: [],
      lastError: null,
    },
    conversationView = null,
    pendingTurn = null,
    ...controllerProps
  } = props;
  const wrapper = ({ children }) => (
    <AppConfigContext.Provider value={{ config, updateConfig }}>
      {children}
    </AppConfigContext.Provider>
  );

  const hook = renderHook(() => useChatSurfaceController({
    chatSurfaceState: {
      messages,
      sdkLiveTurn,
      conversationView,
      pendingTurn,
    },
    sessionInfo: {
      conversationRef: 'conv-1',
      userId: 'user-1',
    },
    setThinkingStatus: jest.fn(),
    setThinkingSourceEventType: jest.fn(),
    warningContext: 'ControllerTest',
    ...controllerProps,
  }), { wrapper });

  return {
    ...hook,
    updateConfig,
  };
}

describe('useChatSurfaceController', () => {
  beforeEach(() => {
    mockRunManualCompaction.mockReset();
    mockRunManualCompaction.mockResolvedValue(undefined);
  });

  test('derives shared surface flags and current-turn busy state without raw Stop authority', () => {
    const { result } = renderController({
      config: {
        speech_mode_enabled: true,
        wakeword_stt_enabled: true,
        include_query_screenshot: false,
      },
    });

    expect(result.current.speechModeEnabled).toBe(true);
    expect(result.current.wakewordSttEnabled).toBe(true);
    expect(result.current.includeQueryScreenshot).toBe(false);
    expect(result.current.isBusy).toBe(true);
    expect(result.current.canStop).toBe(false);
    expect(result.current.visibleTurnLifecycle.status).toBe('active');
    expect(result.current.currentTurnPresentationState.awaitingDotTargetMessageId).toBeNull();
  });

  test('prefers SDK current-turn completion over stale stream phases', () => {
    const { result } = renderController({
      props: {
        phase: 'tool-output',
        streamTracking: { phase: 'tool-output' },
        sdkLiveTurn: {
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

    expect(result.current).toMatchObject({
      isBusy: false,
      canStop: false,
      visibleTurnLifecycle: expect.objectContaining({
        status: 'terminal',
      }),
    });
  });

  test('keeps current-turn lifecycle active when session conversation ref lags', () => {
    const { result } = renderController({
      props: {
        sessionInfo: {
          conversationRef: 'conv-stale-session',
          userId: 'user-1',
        },
        sdkLiveTurn: {
          phase: 'streaming',
          conversationRef: 'conv-visible-turn',
          turnRef: 'turn-visible',
          assistantText: 'streaming response',
          reasoningText: null,
          toolEvents: [],
          lastError: null,
        },
      },
    });

    expect(result.current).toMatchObject({
      isBusy: true,
      canStop: false,
      visibleTurnLifecycle: expect.objectContaining({
        status: 'active',
        conversationRef: 'conv-visible-turn',
        turnRef: 'turn-visible',
      }),
    });
  });

  test('uses SDK awaiting anchor as dashboard typing dot target', () => {
    const { result } = renderController({
      props: {
        sdkLiveTurn: {
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
      awaitingDotTargetMessageId: 'user-row-1',
      chatboxSurfaceState: 'awaiting-reply',
      visibleTurnLifecycle: expect.objectContaining({
        status: 'awaiting',
        source: 'sdk',
      }),
    });
  });

  test('uses SDK awaiting lifecycle when SDK presentation is hidden', () => {
    const { result } = renderController({
      props: {
        pendingTurn: {
          conversationRef: 'conv-1',
          turnRef: 'turn-2',
          userMessageId: 'user-2',
          text: 'second',
          timestamp: '2026-06-21T00:00:00.000Z',
          attachmentFilenames: null,
        },
        messages: [
          { id: 'user-2', type: 'user', sender: 'user', text: 'second', turnRef: 'turn-2' },
        ],
        sdkLiveTurn: {
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

    expect(result.current).toMatchObject({
      isBusy: true,
      canStop: false,
      surfacePhase: 'awaiting-first-chunk',
      surfaceSource: 'current-turn',
    });
    expect(result.current.currentTurnPresentationState).toMatchObject({
      awaitingDotTargetMessageId: 'user-2',
      chatboxSurfaceState: 'awaiting-reply',
    });
  });

  test('keeps renderer-owned local pending visible through SDK idle and visible-empty handoff', () => {
    const { result } = renderController({
      props: {
        pendingTurn: {
          conversationRef: 'conv-1',
          turnRef: 'turn-local',
          userMessageId: 'user-local',
          text: 'local send',
          timestamp: '2026-06-21T00:00:00.000Z',
          attachmentFilenames: null,
        },
        messages: [
          {
            id: 'user-local',
            type: 'user',
            sender: 'user',
            text: 'local send',
            turnRef: 'turn-local',
          },
        ],
        sdkLiveTurn: {
          phase: 'idle',
          conversationRef: 'conv-1',
          turnRef: 'startup-hidden',
          assistantText: '',
          reasoningText: null,
          toolEvents: [],
          lastError: null,
          presentation: {
            conversationRef: 'conv-1',
            turnRef: 'startup-hidden',
            phase: 'idle',
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
              turnRef: 'startup-hidden',
              conversationRef: 'conv-1',
              staleGuardRef: 'startup-hidden',
            },
          },
        },
      },
    });

    expect(result.current).toMatchObject({
      isBusy: true,
      canStop: true,
      surfaceSource: 'pending-turn',
      visibleTurnLifecycle: expect.objectContaining({
        status: 'local_pending',
        source: 'local',
        turnRef: 'turn-local',
      }),
    });
    expect(result.current.currentTurnPresentationState).toMatchObject({
      awaitingDotTargetMessageId: 'user-local',
      chatboxSurfaceState: 'awaiting-reply',
    });
  });

  test('does not let stale raw isSending create local preflight without pending turn', () => {
    const { result } = renderController({
      props: {
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
        sdkLiveTurn: {
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

    expect(result.current).toMatchObject({
      isBusy: false,
      canStop: false,
      surfaceSource: 'current-turn',
      visibleTurnLifecycle: expect.objectContaining({
        status: 'terminal',
      }),
    });
  });

  test('runs pill and dashboard config toggles through one busy gate', () => {
    const { result, updateConfig } = renderController({
      props: {
        sdkLiveTurn: null,
      },
    });

    act(() => {
      expect(result.current.toggleSpeechMode()).toBe(true);
      expect(result.current.toggleQueryScreenshot()).toBe(true);
    });

    expect(updateConfig).toHaveBeenCalledWith({ speech_mode_enabled: true });
    expect(updateConfig).toHaveBeenCalledWith({ include_query_screenshot: false });

    const busyController = renderController({
      updateConfig,
      props: {
        sdkLiveTurn: {
          phase: 'streaming',
          conversationRef: 'conv-1',
          turnRef: 'turn-busy',
          assistantText: 'streaming',
          reasoningText: null,
          toolEvents: [],
          lastError: null,
        },
      },
    });
    act(() => {
      expect(busyController.result.current.toggleSpeechMode()).toBe(false);
      expect(busyController.result.current.toggleQueryScreenshot()).toBe(false);
    });

    expect(updateConfig).toHaveBeenCalledTimes(2);
  });

  test('runs manual compaction with active conversation context when idle', async () => {
    const setThinkingStatus = jest.fn();
    const setThinkingSourceEventType = jest.fn();
    const { result } = renderController({
      props: {
        sdkLiveTurn: null,
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
    });

    await act(async () => {
      await expect(result.current.runManualCompaction()).resolves.toBe(false);
    });

    expect(mockRunManualCompaction).not.toHaveBeenCalled();
  });

  test('allows dashboard-style manual compaction during active turns when requested', async () => {
    const { result } = renderController({
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
