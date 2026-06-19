/**
 * Provides the use response overlay window sync module for the renderer UI.
 */

import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { DesktopResponseOverlayRuntimeClient } from '../../../app/runtime/desktopResponseOverlayRuntimeClient';
import {
  getRoundedFrameSize,
  isCompactHoverLayoutMode,
  RESPONSE_OVERLAY_LAYOUT,
  RESPONSE_OVERLAY_LAYOUT_MODE,
} from '../../../app/runtime/desktopResponseOverlayLayoutRuntime';
import {
  logRendererLiveSurfaceTrace,
  logRendererResponseSurfaceSizeTrace,
} from '../../../app/runtime/desktopRendererTraceRuntime';

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
  const overlayConversationRefRef = useRef(null);
  const reportOverlaySizeRef = useRef(null);

  useEffect(() => {
    const turnRef = overlayIntent?.turnRef ?? null;
    const staleGuardRef = overlayIntent?.staleGuardRef ?? turnRef;
    overlayConversationRefRef.current = overlayIntent?.conversationRef || null;
    if (turnRef || staleGuardRef) {
      lastOverlayGuardRef.current = {
        turnRef,
        staleGuardRef,
      };
    }
  }, [overlayIntent?.conversationRef, overlayIntent?.staleGuardRef, overlayIntent?.turnRef]);

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
        logRendererResponseSurfaceSizeTrace({
          action: 'hide-requested',
          visible: false,
          layoutMode: RESPONSE_OVERLAY_LAYOUT_MODE.HIDDEN,
          width: 0,
          height: 0,
        });
        logRendererLiveSurfaceTrace('response_overlay.renderer.size_report', {
          source: 'renderer-response-window-sync',
          reason: 'hide-requested',
          visible: false,
          layoutMode: RESPONSE_OVERLAY_LAYOUT_MODE.HIDDEN,
          turnRef,
          guardRef: staleGuardRef,
          width: 0,
          height: 0,
        }, overlayIntent?.conversationRef || null);
        await DesktopResponseOverlayRuntimeClient.setResponseboxSizeValues({
          visible: false,
          width: 0,
          height: 0,
          turnRef,
          staleGuardRef,
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
      logRendererResponseSurfaceSizeTrace({
        action: 'show-or-resize-requested',
        visible: true,
        layoutMode,
        showResponse,
        thinkingText,
        compactHover: Boolean(compactHover),
        turnRef,
        staleGuardRef,
        width,
        height,
      });
      logRendererLiveSurfaceTrace('response_overlay.renderer.size_report', {
        source: 'renderer-response-window-sync',
        reason: 'show-or-resize-requested',
        visible: true,
        layoutMode,
        overlayMode: layoutMode === RESPONSE_OVERLAY_LAYOUT_MODE.AWAITING_TYPING
          ? 'awaiting'
          : 'response',
        showResponse,
        thinkingTextLength: typeof thinkingText === 'string' ? thinkingText.length : 0,
        compactHover: Boolean(compactHover),
        turnRef,
        guardRef: staleGuardRef,
        width,
        height,
      }, overlayIntent?.conversationRef || null);
      await DesktopResponseOverlayRuntimeClient.setResponseboxSizeValues({
        visible: true,
        width,
        height,
        compactHover: Boolean(compactHover),
        turnRef,
        staleGuardRef,
      });
    } catch (error) {
      console.warn('[MinimalResponseOverlay] Failed to resize response overlay:', error);
    }
  }, [
    overlayIntent?.conversationRef,
    overlayIntent?.staleGuardRef,
    overlayIntent?.turnRef,
    shellRef,
    showResponse,
    thinkingText,
  ]);

  useEffect(() => {
    reportOverlaySizeRef.current = reportOverlaySize;
  }, [reportOverlaySize]);

  useEffect(() => {
    const removeListener = DesktopResponseOverlayRuntimeClient.onResponseOverlayVisibility((isOverlayVisible) => {
      if (!isOverlayVisible) {
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

  useLayoutEffect(() => {
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

    void reportOverlaySize({
      visible: true,
      layoutMode: overlayLayoutMode,
    });

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
    shellRef,
    showResponse,
    thinkingText,
  ]);

  useEffect(() => {
    logRendererLiveSurfaceTrace('renderer.response_overlay.mount', {
      source: 'renderer-response-window-sync',
      turnRef: lastOverlayGuardRef.current.turnRef,
      guardRef: lastOverlayGuardRef.current.staleGuardRef,
    }, overlayConversationRefRef.current);
    return () => {
      logRendererLiveSurfaceTrace('renderer.response_overlay.unmount', {
        source: 'renderer-response-window-sync',
        turnRef: lastOverlayGuardRef.current.turnRef,
        guardRef: lastOverlayGuardRef.current.staleGuardRef,
      }, overlayConversationRefRef.current);
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
