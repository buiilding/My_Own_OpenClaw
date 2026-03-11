/** @jest-environment node */

const {
  RESPONSE_OVERLAY_WINDOW_MODE,
  isStreamingResponseOverlayPhase,
  resolveResponseOverlayWindowMode,
  resolveChatWindowResponseOverlayRestore,
  shouldRestoreTerminalResponseWindow,
} = require('../../frontend/src/main/response_overlay_visibility_policy.cjs');

const PHASE = Object.freeze({
  IDLE: 'idle',
  AWAITING_FIRST_CHUNK: 'awaiting-first-chunk',
  STREAMING: 'streaming',
  TOOL_CALL: 'tool-call',
  TOOL_OUTPUT: 'tool-output',
  COMPLETE: 'complete',
  ERROR: 'error',
});

describe('response_overlay_visibility_policy', () => {
  test('maps active loop phases to active-loop mode', () => {
    expect(resolveResponseOverlayWindowMode(PHASE.AWAITING_FIRST_CHUNK, PHASE)).toBe(RESPONSE_OVERLAY_WINDOW_MODE.ACTIVE_LOOP);
    expect(resolveResponseOverlayWindowMode(PHASE.STREAMING, PHASE)).toBe(RESPONSE_OVERLAY_WINDOW_MODE.ACTIVE_LOOP);
    expect(resolveResponseOverlayWindowMode(PHASE.TOOL_CALL, PHASE)).toBe(RESPONSE_OVERLAY_WINDOW_MODE.ACTIVE_LOOP);
    expect(resolveResponseOverlayWindowMode(PHASE.TOOL_OUTPUT, PHASE)).toBe(RESPONSE_OVERLAY_WINDOW_MODE.ACTIVE_LOOP);
    expect(isStreamingResponseOverlayPhase(PHASE.COMPLETE, PHASE)).toBe(false);
  });

  test('maps idle and terminal phases distinctly', () => {
    expect(resolveResponseOverlayWindowMode(PHASE.IDLE, PHASE)).toBe(RESPONSE_OVERLAY_WINDOW_MODE.HIDDEN);
    expect(resolveResponseOverlayWindowMode(PHASE.COMPLETE, PHASE)).toBe(RESPONSE_OVERLAY_WINDOW_MODE.TERMINAL);
    expect(resolveResponseOverlayWindowMode(PHASE.ERROR, PHASE)).toBe(RESPONSE_OVERLAY_WINDOW_MODE.TERMINAL);
  });

  test('restores response overlay for focused chatbox show when visible or streaming', () => {
    expect(resolveChatWindowResponseOverlayRestore({
      focus: true,
      restoreResponseOverlay: false,
      responseOverlayVisible: true,
      isResponseOverlayStreamingPhase: () => false,
    })).toEqual({
      shouldRestoreResponse: true,
      shouldPrimeFallbackBounds: false,
    });

    expect(resolveChatWindowResponseOverlayRestore({
      focus: false,
      restoreResponseOverlay: false,
      responseOverlayVisible: false,
      isResponseOverlayStreamingPhase: () => true,
    })).toEqual({
      shouldRestoreResponse: false,
      shouldPrimeFallbackBounds: true,
    });

    expect(resolveChatWindowResponseOverlayRestore({
      focus: false,
      restoreResponseOverlay: true,
      responseOverlayVisible: false,
      isResponseOverlayStreamingPhase: () => true,
    })).toEqual({
      shouldRestoreResponse: true,
      shouldPrimeFallbackBounds: true,
    });
  });

  test('terminal restore requires cached visibility and visible chat shell', () => {
    const responseWindow = {
      isDestroyed: jest.fn().mockReturnValue(false),
    };
    const chatWindow = {
      isDestroyed: jest.fn().mockReturnValue(false),
      isVisible: jest.fn().mockReturnValue(true),
    };

    expect(shouldRestoreTerminalResponseWindow({
      getResponseOverlayVisible: () => true,
      responseWindow,
      chatWindow,
    })).toBe(true);

    chatWindow.isVisible.mockReturnValue(false);
    expect(shouldRestoreTerminalResponseWindow({
      getResponseOverlayVisible: () => true,
      responseWindow,
      chatWindow,
    })).toBe(false);
  });
});
