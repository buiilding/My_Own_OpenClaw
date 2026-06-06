import { useCallback, useEffect, useRef } from 'react';
import { IpcBridge, INVOKE_CHANNELS, ON_CHANNELS } from '../../../infrastructure/ipc/bridge';
import { getRoundedFrameSize } from '../../chat/utils/overlay/overlayFrameSize';
import {
  isCompactHoverLayoutMode,
  RESPONSE_OVERLAY_LAYOUT_MODE,
} from '../../chat/utils/overlay/responseOverlayLayoutMode';
import { RESPONSE_OVERLAY_LAYOUT } from '../../chat/utils/overlay/responseOverlayLayoutContract';
import { logRendererResponseSurfaceTrace } from '../../chat/utils/chatStream/chatStreamDebugTrace';

const TYPING_FRAME_HEIGHT = RESPONSE_OVERLAY_LAYOUT.AWAITING_FRAME_HEIGHT;

function createHiddenFrameState() {
  return {
    width: 0,
    height: 0,
    visible: false,
    fullScreenGhost: false,
    compactHover: false,
    layoutMode: RESPONSE_OVERLAY_LAYOUT_MODE.HIDDEN,
  };
}

export function useResponseOverlayWindowSync({
  shellRef,
  isVisible,
  overlayLayoutMode,
  overlayIntent = null,
  responseEntrySignature,
  showResponse,
  thinkingText,
}) {
  const lastFrameRef = useRef(createHiddenFrameState());
  const lastOverlayGuardRef = useRef({
    turnRef: null,
    staleGuardRef: null,
  });
  const reportOverlaySizeRef = useRef(null);

  useEffect(() => {
    const turnRef = overlayIntent?.turnRef ?? null;
    const staleGuardRef = overlayIntent?.staleGuardRef ?? turnRef;
    if (turnRef || staleGuardRef) {
      lastOverlayGuardRef.current = {
        turnRef,
        staleGuardRef,
      };
    }
  }, [overlayIntent?.staleGuardRef, overlayIntent?.turnRef]);

  const reportOverlaySize = useCallback(async ({
    visible,
    layoutMode = RESPONSE_OVERLAY_LAYOUT_MODE.HIDDEN,
  }) => {
    const turnRef = overlayIntent?.turnRef ?? lastOverlayGuardRef.current.turnRef ?? null;
    const staleGuardRef = (
      overlayIntent?.staleGuardRef
      ?? overlayIntent?.turnRef
      ?? lastOverlayGuardRef.current.staleGuardRef
      ?? lastOverlayGuardRef.current.turnRef
      ?? null
    );
    if (!visible) {
      if (lastFrameRef.current.visible === false) {
        return;
      }
      lastFrameRef.current = createHiddenFrameState();
      try {
        logRendererResponseSurfaceTrace({
          source: 'renderer-response-window-sync',
          action: 'hide-requested',
          visible: false,
          layout_mode: RESPONSE_OVERLAY_LAYOUT_MODE.HIDDEN,
          width: 0,
          height: 0,
        });
        await IpcBridge.invoke(INVOKE_CHANNELS.SET_RESPONSEBOX_SIZE, {
          visible: false,
          width: 0,
          height: 0,
          turn_ref: turnRef,
          stale_guard_ref: staleGuardRef,
        });
      } catch (error) {
        console.warn('[MinimalResponseOverlay] Failed to hide response overlay:', error);
      }
      return;
    }

    const nextFrame = getRoundedFrameSize(shellRef.current);
    if (!nextFrame) {
      return;
    }

    const compactHover = isCompactHoverLayoutMode(layoutMode);
    let { width, height } = nextFrame;
    if (layoutMode === RESPONSE_OVERLAY_LAYOUT_MODE.AWAITING_TYPING) {
      height = TYPING_FRAME_HEIGHT;
    }

    const unchanged = (
      lastFrameRef.current.visible === true
      && lastFrameRef.current.fullScreenGhost === false
      && lastFrameRef.current.compactHover === Boolean(compactHover)
      && lastFrameRef.current.layoutMode === layoutMode
      && lastFrameRef.current.width === width
      && lastFrameRef.current.height === height
    );
    if (unchanged) {
      return;
    }

    lastFrameRef.current = {
      width,
      height,
      visible: true,
      fullScreenGhost: false,
      compactHover: Boolean(compactHover),
      layoutMode,
    };

    try {
      logRendererResponseSurfaceTrace({
        source: 'renderer-response-window-sync',
        action: 'show-or-resize-requested',
        visible: true,
        layout_mode: layoutMode,
        show_response: showResponse,
        thinking_text_length: typeof thinkingText === 'string' ? thinkingText.length : 0,
        compact_hover: Boolean(compactHover),
        turn_ref: turnRef,
        stale_guard_ref: staleGuardRef,
        width,
        height,
      });
      await IpcBridge.invoke(INVOKE_CHANNELS.SET_RESPONSEBOX_SIZE, {
        visible: true,
        width,
        height,
        compact_hover: Boolean(compactHover),
        turn_ref: turnRef,
        stale_guard_ref: staleGuardRef,
      });
    } catch (error) {
      console.warn('[MinimalResponseOverlay] Failed to resize response overlay:', error);
    }
  }, [overlayIntent?.staleGuardRef, overlayIntent?.turnRef, shellRef, showResponse, thinkingText]);

  useEffect(() => {
    reportOverlaySizeRef.current = reportOverlaySize;
  }, [reportOverlaySize]);

  useEffect(() => {
    const removeListener = IpcBridge.on(ON_CHANNELS.RESPONSE_OVERLAY_VISIBILITY, (payload = {}) => {
      const overlayVisible = payload?.visible === true;
      if (!overlayVisible) {
        lastFrameRef.current = createHiddenFrameState();
        return;
      }
      if (!isVisible) {
        return;
      }
      window.requestAnimationFrame(() => {
        void reportOverlaySize({
          visible: true,
          layoutMode: overlayLayoutMode,
        });
      });
    });
    return () => {
      removeListener?.();
    };
  }, [
    isVisible,
    overlayLayoutMode,
    reportOverlaySize,
  ]);

  useEffect(() => {
    let cancelled = false;
    let rafId = null;
    let retryTimerId = null;
    let resizeObserver = null;

    if (!isVisible) {
      void reportOverlaySize({
        visible: false,
        layoutMode: RESPONSE_OVERLAY_LAYOUT_MODE.HIDDEN,
      });
      return undefined;
    }

    const scheduleSizeUpdate = () => {
      if (cancelled) {
        return;
      }
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
      }
      rafId = window.requestAnimationFrame(() => {
        if (cancelled) {
          return;
        }
        void reportOverlaySize({
          visible: true,
          layoutMode: overlayLayoutMode,
        });
      });
    };

    scheduleSizeUpdate();
    retryTimerId = window.setTimeout(scheduleSizeUpdate, 40);
    if (typeof ResizeObserver === 'function' && shellRef.current) {
      resizeObserver = new ResizeObserver(scheduleSizeUpdate);
      resizeObserver.observe(shellRef.current);
    }

    return () => {
      cancelled = true;
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
      }
      if (retryTimerId !== null) {
        window.clearTimeout(retryTimerId);
      }
      resizeObserver?.disconnect();
    };
  }, [
    isVisible,
    overlayLayoutMode,
    reportOverlaySize,
    responseEntrySignature,
    showResponse,
    thinkingText,
  ]);

  useEffect(() => {
    return () => {
      const report = reportOverlaySizeRef.current;
      if (typeof report !== 'function') {
        return;
      }
      void report({
        visible: false,
        layoutMode: RESPONSE_OVERLAY_LAYOUT_MODE.HIDDEN,
      });
    };
  }, []);
}
