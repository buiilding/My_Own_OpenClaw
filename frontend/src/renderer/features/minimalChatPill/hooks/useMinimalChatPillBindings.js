/**
 * Provides the use minimal chat pill bindings module for the renderer UI.
 */

import { useEffect } from 'react';
import { DesktopWindowRuntimeClient } from '../../../app/runtime/desktopWindowRuntimeClient';
import { CHATBOX_VISUAL_ANCHOR_HEIGHT_COMPACT, resolveChatboxVisualAnchorHeight } from '../../../app/runtime/desktopChatboxLayoutRuntime';

const CHATBOX_VISUAL_ANCHOR_RESIZE_SETTLE_MS = 120;

export function useChatboxFocusBindings(focusInput) {
  useEffect(() => {
    const removeListener = DesktopWindowRuntimeClient.onChatboxFocus(() => {
      focusInput();
    });
    return () => {
      removeListener?.();
    };
  }, [focusInput]);
}

export function useChatboxWakewordSttTriggerBinding({
  wakewordSttEnabled,
  resetTranscription,
  setInputValue,
  setWakewordSttSessionActive,
}) {
  useEffect(() => {
    const removeListener = DesktopWindowRuntimeClient.onWakewordSttTrigger(() => {
      if (!wakewordSttEnabled) {
        setWakewordSttSessionActive(false);
        return;
      }
      resetTranscription();
      setInputValue('');
      setWakewordSttSessionActive(true);
    });
    return () => {
      removeListener?.();
    };
  }, [
    resetTranscription,
    setInputValue,
    setWakewordSttSessionActive,
    wakewordSttEnabled,
  ]);
}

export function useChatboxDragWindowBindings(handleDragMove, stopDragging) {
  useEffect(() => {
    window.addEventListener('pointermove', handleDragMove);
    window.addEventListener('pointerup', stopDragging);
    window.addEventListener('mousemove', handleDragMove);
    window.addEventListener('mouseup', stopDragging);
    window.addEventListener('blur', stopDragging);
    return () => {
      window.removeEventListener('pointermove', handleDragMove);
      window.removeEventListener('pointerup', stopDragging);
      window.removeEventListener('mousemove', handleDragMove);
      window.removeEventListener('mouseup', stopDragging);
      window.removeEventListener('blur', stopDragging);
    };
  }, [handleDragMove, stopDragging]);
}

export function useChatboxVisualAnchorBindings({
  shellRef,
  hasImagePreview,
  frameHeight = null,
  anchorHeightOverride = null,
}) {
  useEffect(() => {
    let cancelled = false;
    let lastReportedSignature = null;
    let scheduledFrame = null;
    let scheduledTimeout = null;
    const shellElement = shellRef?.current || null;

    const commitAnchorHeight = () => {
      scheduledFrame = null;
      const overrideAnchorHeight = Math.round(Number(anchorHeightOverride));
      const nextAnchorHeight = Number.isFinite(overrideAnchorHeight) && overrideAnchorHeight > 0
        ? overrideAnchorHeight
        : resolveChatboxVisualAnchorHeight({
          hasImagePreview,
          shellHeight: shellElement?.offsetHeight ?? null,
        });
      const nextFrameHeight = Math.round(Number(frameHeight));
      const normalizedFrameHeight = Number.isFinite(nextFrameHeight) && nextFrameHeight > 0
        ? nextFrameHeight
        : null;
      const nextSignature = `${nextAnchorHeight}:${normalizedFrameHeight || ''}`;
      if (nextSignature === lastReportedSignature) {
        return;
      }
      lastReportedSignature = nextSignature;
      const payload = {
        height: nextAnchorHeight,
      };
      if (normalizedFrameHeight !== null) {
        payload.frameHeight = normalizedFrameHeight;
      }
      DesktopWindowRuntimeClient.setChatboxVisualAnchorHeight(payload).catch((error) => {
        if (!cancelled) {
          console.warn('[MinimalChatPill] Failed to sync visual anchor height:', error);
        }
      });
    };

    const scheduleAnchorHeightReport = () => {
      if (cancelled) {
        return;
      }

      const queueCommit = () => {
        if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
          commitAnchorHeight();
          return;
        }
        if (scheduledFrame !== null) {
          window.cancelAnimationFrame?.(scheduledFrame);
        }
        scheduledFrame = window.requestAnimationFrame(() => {
          if (!cancelled) {
            commitAnchorHeight();
          }
        });
      };

      if (CHATBOX_VISUAL_ANCHOR_RESIZE_SETTLE_MS <= 0) {
        queueCommit();
        return;
      }

      if (scheduledTimeout !== null) {
        window.clearTimeout?.(scheduledTimeout);
      }
      scheduledTimeout = window.setTimeout(() => {
        scheduledTimeout = null;
        queueCommit();
      }, CHATBOX_VISUAL_ANCHOR_RESIZE_SETTLE_MS);
    };

    commitAnchorHeight();

    if (!shellElement || typeof ResizeObserver !== 'function') {
      return () => {
        cancelled = true;
        if (scheduledTimeout !== null) {
          window.clearTimeout?.(scheduledTimeout);
          scheduledTimeout = null;
        }
        if (scheduledFrame !== null) {
          window.cancelAnimationFrame?.(scheduledFrame);
          scheduledFrame = null;
        }
      };
    }

    const resizeObserver = new ResizeObserver(() => {
      scheduleAnchorHeightReport();
    });
    resizeObserver.observe(shellElement);

    return () => {
      cancelled = true;
      if (scheduledTimeout !== null) {
        window.clearTimeout?.(scheduledTimeout);
        scheduledTimeout = null;
      }
      if (scheduledFrame !== null) {
        window.cancelAnimationFrame?.(scheduledFrame);
        scheduledFrame = null;
      }
      resizeObserver.disconnect();
    };
  }, [anchorHeightOverride, frameHeight, hasImagePreview, shellRef]);

  useEffect(() => {
    return () => {
      DesktopWindowRuntimeClient.setChatboxVisualAnchorHeight({
        height: CHATBOX_VISUAL_ANCHOR_HEIGHT_COMPACT,
      }).catch(() => {});
    };
  }, []);
}
