import { useCallback, useEffect, useRef } from 'react';
import { IpcBridge, INVOKE_CHANNELS, ON_CHANNELS } from '../../../infrastructure/ipc/bridge';
import { getRoundedFrameSize } from '../utils/overlay/overlayFrameSize';
import {
  isCompactHoverLayoutMode,
  RESPONSE_OVERLAY_LAYOUT_MODE,
} from '../utils/overlay/responseOverlayLayoutMode';
import { RESPONSE_OVERLAY_LAYOUT } from '../utils/overlay/responseOverlayLayoutContract';

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
  responseEntrySignature,
  showResponse,
  thinkingText,
}) {
  const lastFrameRef = useRef(createHiddenFrameState());

  const reportOverlaySize = useCallback(async ({
    visible,
    layoutMode = RESPONSE_OVERLAY_LAYOUT_MODE.HIDDEN,
  }) => {
    if (!visible) {
      if (lastFrameRef.current.visible === false) {
        return;
      }
      lastFrameRef.current = createHiddenFrameState();
      try {
        console.log('[ResponseOverlayWindowSync][renderer]', {
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
        });
      } catch (error) {
        console.warn('[ChatBoxResponse] Failed to hide response overlay:', error);
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
      console.log('[ResponseOverlayWindowSync][renderer]', {
        action: 'show-or-resize-requested',
        visible: true,
        layout_mode: layoutMode,
        show_response: showResponse,
        thinking_text_length: typeof thinkingText === 'string' ? thinkingText.length : 0,
        compact_hover: Boolean(compactHover),
        width,
        height,
      });
      await IpcBridge.invoke(INVOKE_CHANNELS.SET_RESPONSEBOX_SIZE, {
        visible: true,
        width,
        height,
        compact_hover: Boolean(compactHover),
      });
    } catch (error) {
      console.warn('[ChatBoxResponse] Failed to resize response overlay:', error);
    }
  }, [shellRef, showResponse, thinkingText]);

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

    return () => {
      cancelled = true;
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
      }
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
      void reportOverlaySize({
        visible: false,
        layoutMode: RESPONSE_OVERLAY_LAYOUT_MODE.HIDDEN,
      });
    };
  }, [reportOverlaySize]);
}
