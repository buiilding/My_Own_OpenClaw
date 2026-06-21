/**
 * Provides the use response overlay window sync module for the renderer UI.
 */

import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { DesktopResponseOverlayRuntimeClient } from '../../../app/runtime/desktopResponseOverlayRuntimeClient';
import {
  getHiddenResponseOverlayLayoutMode,
  getRoundedFrameSize,
  getResponseOverlayAwaitingFrameHeight,
  isCompactHoverLayoutMode,
  isAwaitingResponseOverlayLayoutMode,
} from '../../../app/runtime/desktopResponseOverlayLayoutRuntime';
import {
  logRendererResponseOverlayLifecycleTrace,
  logRendererResponseSurfaceSizeTrace,
} from '../../../app/runtime/desktopRendererTraceRuntime';

const TYPING_FRAME_HEIGHT = getResponseOverlayAwaitingFrameHeight();

function createHiddenFrameState() {
  return {
    width: 0,
    height: 0,
    visible: false,
    fullScreenGhost: false,
    compactHover: false,
    layoutMode: getHiddenResponseOverlayLayoutMode(),
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
    layoutMode = getHiddenResponseOverlayLayoutMode(),
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
          conversationRef: overlayIntent?.conversationRef || null,
          visible: false,
          layoutMode: getHiddenResponseOverlayLayoutMode(),
          turnRef,
          staleGuardRef,
          width: 0,
          height: 0,
        });
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
    if (isAwaitingResponseOverlayLayoutMode(layoutMode)) {
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
        conversationRef: overlayIntent?.conversationRef || null,
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
        layoutMode: getHiddenResponseOverlayLayoutMode(),
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
    logRendererResponseOverlayLifecycleTrace({
      action: 'mount',
      conversationRef: overlayConversationRefRef.current,
      turnRef: lastOverlayGuardRef.current.turnRef,
      staleGuardRef: lastOverlayGuardRef.current.staleGuardRef,
    });
    return () => {
      logRendererResponseOverlayLifecycleTrace({
        action: 'unmount',
        conversationRef: overlayConversationRefRef.current,
        turnRef: lastOverlayGuardRef.current.turnRef,
        staleGuardRef: lastOverlayGuardRef.current.staleGuardRef,
      });
      const report = reportOverlaySizeRef.current;
      if (typeof report !== 'function') {
        return;
      }
      void report({
        visible: false,
        layoutMode: getHiddenResponseOverlayLayoutMode(),
      });
    };
  }, []);
}
