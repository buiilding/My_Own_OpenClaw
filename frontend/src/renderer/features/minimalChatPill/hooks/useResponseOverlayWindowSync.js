/**
 * Provides the use response overlay window sync module for the renderer UI.
 */

import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { DesktopResponseOverlayRuntimeClient } from '../../../app/runtime/desktopResponseOverlayRuntimeClient';
import { DesktopResponseOverlayLayoutRuntime } from '../../../app/runtime/desktopResponseOverlayLayoutRuntime';
import { DesktopRendererTraceRuntime } from '../../../app/runtime/desktopRendererTraceRuntime';
import { DesktopResponseOverlayInteractionRuntime } from '../../../app/runtime/desktopResponseOverlayInteractionRuntime';

const {
  logRendererResponseOverlayLifecycleTrace,
  logRendererResponseSurfaceSizeTrace,
} = DesktopRendererTraceRuntime;

const TYPING_FRAME_HEIGHT = (
  DesktopResponseOverlayLayoutRuntime.getResponseOverlayAwaitingFrameHeight()
);

function createHiddenFrameState() {
  return {
    width: 0,
    height: 0,
    visible: false,
    fullScreenGhost: false,
    compactHover: false,
    layoutMode: DesktopResponseOverlayLayoutRuntime.getHiddenResponseOverlayLayoutMode(),
  };
}

export function useResponseOverlayWindowSync({
  shellRef,
  isVisible,
  overlayLayoutMode,
  overlayIntent = null,
  responseEntrySignature,
  responseVisible,
  thinkingText,
}) {
  const lastFrameRef = useRef(createHiddenFrameState());
  const lastOverlayGuardRef = useRef({
    turnRef: null,
    staleGuardRef: null,
  });
  const overlayConversationRefRef = useRef(null);
  const reportOverlaySizeRef = useRef(null);
  const visibilityRereportCancelRef = useRef(null);

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
    layoutMode = DesktopResponseOverlayLayoutRuntime.getHiddenResponseOverlayLayoutMode(),
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
          layoutMode: DesktopResponseOverlayLayoutRuntime.getHiddenResponseOverlayLayoutMode(),
          turnRef,
          staleGuardRef,
          width: 0,
          height: 0,
        });
        await DesktopResponseOverlayRuntimeClient.setResponseboxSizeValues({
          visible: false,
          width: 0,
          height: 0,
          layoutMode,
          turnRef,
          staleGuardRef,
        });
      } catch (error) {
        console.warn('[MinimalResponseOverlay] Failed to hide response overlay:', error);
      }
      return;
    }

    const nextFrame = DesktopResponseOverlayLayoutRuntime.getRoundedFrameSize(shellRef.current);
    if (!nextFrame) {
      return;
    }

    const compactHover = DesktopResponseOverlayLayoutRuntime.isCompactHoverLayoutMode(layoutMode);
    let { width, height } = nextFrame;
    if (compactHover) {
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
        responseVisible,
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
        layoutMode,
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
    responseVisible,
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
      visibilityRereportCancelRef.current?.();
      visibilityRereportCancelRef.current = (
        DesktopResponseOverlayInteractionRuntime.scheduleResponseOverlayFrame({
          callback: () => {
            void reportOverlaySize({
              visible: true,
              layoutMode: overlayLayoutMode,
            });
          },
        })
      );
    });
    return () => {
      visibilityRereportCancelRef.current?.();
      visibilityRereportCancelRef.current = null;
      removeListener?.();
    };
  }, [
    isVisible,
    overlayLayoutMode,
    reportOverlaySize,
  ]);

  useLayoutEffect(() => {
    if (!isVisible) {
      void reportOverlaySize({
        visible: false,
        layoutMode: DesktopResponseOverlayLayoutRuntime.getHiddenResponseOverlayLayoutMode(),
      });
      return undefined;
    }

    const reportVisibleSize = () => {
      void reportOverlaySize({
        visible: true,
        layoutMode: overlayLayoutMode,
      });
    };

    reportVisibleSize();

    return DesktopResponseOverlayInteractionRuntime.startResponseOverlaySizeUpdateSync({
      shellRef,
      onSizeUpdate: reportVisibleSize,
    });
  }, [
    isVisible,
    overlayLayoutMode,
    reportOverlaySize,
    responseEntrySignature,
    shellRef,
    responseVisible,
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
        layoutMode: DesktopResponseOverlayLayoutRuntime.getHiddenResponseOverlayLayoutMode(),
      });
    };
  }, []);
}
