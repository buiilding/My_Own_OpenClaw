import { useEffect } from 'react';
import { IpcBridge, INVOKE_CHANNELS, ON_CHANNELS } from '../../../infrastructure/ipc/bridge';
import { CHATBOX_VISUAL_ANCHOR_HEIGHT_COMPACT, resolveChatboxVisualAnchorHeight } from '../utils/state/chatBoxState';

export function useChatboxFocusBindings(focusInput) {
  useEffect(() => {
    focusInput();
  }, [focusInput]);

  useEffect(() => {
    const removeListener = IpcBridge.on(ON_CHANNELS.CHATBOX_FOCUS, () => {
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
  focusInput,
}) {
  useEffect(() => {
    const removeListener = IpcBridge.on(ON_CHANNELS.WAKEWORD_STT_TRIGGER, () => {
      if (!wakewordSttEnabled) {
        setWakewordSttSessionActive(false);
        return;
      }
      resetTranscription();
      setInputValue('');
      setWakewordSttSessionActive(true);
      focusInput();
    });
    return () => {
      removeListener?.();
    };
  }, [
    focusInput,
    resetTranscription,
    setInputValue,
    setWakewordSttSessionActive,
    wakewordSttEnabled,
  ]);
}

export function useChatboxDragWindowBindings(handleDragMove, stopDragging) {
  useEffect(() => {
    window.addEventListener('mousemove', handleDragMove);
    window.addEventListener('mouseup', stopDragging);
    window.addEventListener('blur', stopDragging);
    return () => {
      window.removeEventListener('mousemove', handleDragMove);
      window.removeEventListener('mouseup', stopDragging);
      window.removeEventListener('blur', stopDragging);
    };
  }, [handleDragMove, stopDragging]);
}

export function useChatboxVisualAnchorBindings({
  shellRef,
  hasImagePreview,
}) {
  useEffect(() => {
    let cancelled = false;
    let lastReportedHeight = null;
    const shellElement = shellRef?.current || null;

    const reportAnchorHeight = () => {
      const nextAnchorHeight = resolveChatboxVisualAnchorHeight({
        hasImagePreview,
        shellHeight: shellElement?.offsetHeight ?? null,
      });
      if (nextAnchorHeight === lastReportedHeight) {
        return;
      }
      lastReportedHeight = nextAnchorHeight;
      IpcBridge.invoke(INVOKE_CHANNELS.SET_CHATBOX_VISUAL_ANCHOR_HEIGHT, {
        height: nextAnchorHeight,
      }).catch((error) => {
        if (!cancelled) {
          console.warn('[ChatBox] Failed to sync visual anchor height:', error);
        }
      });
    };

    reportAnchorHeight();

    if (!shellElement || typeof ResizeObserver !== 'function') {
      return () => {
        cancelled = true;
      };
    }

    const resizeObserver = new ResizeObserver(() => {
      reportAnchorHeight();
    });
    resizeObserver.observe(shellElement);

    return () => {
      cancelled = true;
      resizeObserver.disconnect();
    };
  }, [hasImagePreview, shellRef]);

  useEffect(() => {
    return () => {
      IpcBridge.invoke(INVOKE_CHANNELS.SET_CHATBOX_VISUAL_ANCHOR_HEIGHT, {
        height: CHATBOX_VISUAL_ANCHOR_HEIGHT_COMPACT,
      }).catch(() => {});
    };
  }, []);
}
