/**
 * Provides the use minimal chat pill bindings module for the renderer UI.
 */

import { useEffect } from 'react';
import { DesktopWindowRuntimeClient } from '../../../app/runtime/desktopWindowRuntimeClient';
import { DesktopChatboxInteractionRuntime } from '../../../app/runtime/desktopChatboxInteractionRuntime';

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
    return DesktopChatboxInteractionRuntime.subscribeToChatboxDragWindowEvents({
      onDragMove: handleDragMove,
      onStopDragging: stopDragging,
    });
  }, [handleDragMove, stopDragging]);
}

export function useChatboxVisualAnchorBindings({
  shellRef,
  hasImagePreview,
  frameHeight = null,
  anchorHeightOverride = null,
}) {
  useEffect(() => {
    return DesktopChatboxInteractionRuntime.startChatboxVisualAnchorSync({
      anchorHeightOverride,
      frameHeight,
      hasImagePreview,
      shellRef,
    });
  }, [anchorHeightOverride, frameHeight, hasImagePreview, shellRef]);

  useEffect(() => {
    return () => {
      DesktopChatboxInteractionRuntime.resetChatboxVisualAnchorHeight();
    };
  }, []);
}
