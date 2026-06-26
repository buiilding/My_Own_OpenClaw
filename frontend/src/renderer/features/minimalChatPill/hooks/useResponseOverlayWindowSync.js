/**
 * Provides the use response overlay window sync module for the renderer UI.
 */

import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { DesktopResponseOverlayRuntimeClient } from '../../../app/runtime/desktopResponseOverlayRuntimeClient';
import { DesktopResponseOverlayLayoutRuntime } from '../../../app/runtime/desktopResponseOverlayLayoutRuntime';
import { DesktopResponseOverlayViewRuntime } from '../../../app/runtime/desktopResponseOverlayViewRuntime';
import { DesktopRendererTraceRuntime } from '../../../app/runtime/desktopRendererTraceRuntime';
import { DesktopResponseOverlayInteractionRuntime } from '../../../app/runtime/desktopResponseOverlayInteractionRuntime';

const {
  logRendererResponseOverlayLifecycleTrace,
  logRendererResponseSurfaceSizeTrace,
} = DesktopRendererTraceRuntime;

const TYPING_FRAME_HEIGHT = (
  DesktopResponseOverlayLayoutRuntime.getResponseOverlayAwaitingFrameHeight()
);
const {
  buildResponseOverlayWindowLifecycleTraceValues,
  buildResponseOverlayWindowSizeTraceValues,
  buildResponseOverlayWindowSizeValues,
  createResponseOverlayWindowGuardSnapshot,
  resolveResponseOverlayWindowGuardSnapshot,
  resolveResponseOverlayWindowSizeIdentity,
} = DesktopResponseOverlayViewRuntime;

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
  const overlayWindowGuardRef = useRef(createResponseOverlayWindowGuardSnapshot());
  const reportOverlaySizeRef = useRef(null);
  const visibilityRereportCancelRef = useRef(null);

  useEffect(() => {
    overlayWindowGuardRef.current = resolveResponseOverlayWindowGuardSnapshot({
      overlayIntent,
      previousSnapshot: overlayWindowGuardRef.current,
    });
  }, [overlayIntent]);

  const reportOverlaySize = useCallback(async ({
    visible,
    layoutMode = DesktopResponseOverlayLayoutRuntime.getHiddenResponseOverlayLayoutMode(),
  }) => {
    const sizeIdentity = resolveResponseOverlayWindowSizeIdentity({
      overlayIntent,
      guardSnapshot: overlayWindowGuardRef.current,
    });
    if (!visible) {
      if (lastFrameRef.current.visible === false) {
        return;
      }
      lastFrameRef.current = createHiddenFrameState();
      try {
        logRendererResponseSurfaceSizeTrace(buildResponseOverlayWindowSizeTraceValues({
          action: 'hide-requested',
          visible: false,
          layoutMode: DesktopResponseOverlayLayoutRuntime.getHiddenResponseOverlayLayoutMode(),
          sizeIdentity,
          width: 0,
          height: 0,
        }));
        await DesktopResponseOverlayRuntimeClient.setResponseboxSizeValues(buildResponseOverlayWindowSizeValues({
          visible: false,
          width: 0,
          height: 0,
          sizeIdentity,
        }));
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
      logRendererResponseSurfaceSizeTrace(buildResponseOverlayWindowSizeTraceValues({
        action: 'show-or-resize-requested',
        visible: true,
        layoutMode,
        responseVisible,
        thinkingText,
        compactHover: Boolean(compactHover),
        sizeIdentity,
        width,
        height,
      }));
      await DesktopResponseOverlayRuntimeClient.setResponseboxSizeValues(buildResponseOverlayWindowSizeValues({
        visible: true,
        width,
        height,
        compactHover: Boolean(compactHover),
        sizeIdentity,
      }));
    } catch (error) {
      console.warn('[MinimalResponseOverlay] Failed to resize response overlay:', error);
    }
  }, [
    overlayIntent,
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
    logRendererResponseOverlayLifecycleTrace(buildResponseOverlayWindowLifecycleTraceValues({
      action: 'mount',
      guardSnapshot: overlayWindowGuardRef.current,
    }));
    return () => {
      logRendererResponseOverlayLifecycleTrace(buildResponseOverlayWindowLifecycleTraceValues({
        action: 'unmount',
        guardSnapshot: overlayWindowGuardRef.current,
      }));
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
