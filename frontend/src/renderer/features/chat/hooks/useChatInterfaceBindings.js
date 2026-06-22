/**
 * Provides the use chat interface bindings module for the renderer UI.
 */

import { useEffect } from 'react';
import { DesktopAudioRuntimeClient } from '../../../app/runtime/desktopAudioRuntimeClient';
import { DesktopChatInterfaceBindingsRuntime } from '../../../app/runtime/desktopChatInterfaceBindingsRuntime';
import { DesktopChatEventsRuntime } from '../../../app/runtime/desktopChatEvents';

const {
  subscribeDesktopRuntimeNewChatEvent,
} = DesktopChatEventsRuntime;

export function useChatInterfaceAudioChunkStream(audioPlayerRef) {
  useEffect(() => {
    const removeListener = DesktopAudioRuntimeClient.onAudioChunk((audioChunk) => {
      if (audioPlayerRef.current) {
        audioPlayerRef.current.enqueueAudio(audioChunk);
      }
    });
    return removeListener;
  }, [audioPlayerRef]);
}

export function useChatInterfaceMenuDismiss({
  providerMenuRef,
  modelMenuRef,
  reasoningModeMenuRef = null,
  setProviderMenuOpen,
  setModelMenuOpen,
  setReasoningModeMenuOpen = () => {},
}) {
  useEffect(() => {
    return DesktopChatInterfaceBindingsRuntime.subscribeToMenuDismiss({
      menus: [
        { ref: providerMenuRef, dismiss: () => setProviderMenuOpen(false) },
        { ref: modelMenuRef, dismiss: () => setModelMenuOpen(false) },
        { ref: reasoningModeMenuRef, dismiss: () => setReasoningModeMenuOpen(false) },
      ],
    });
  }, [
    modelMenuRef,
    providerMenuRef,
    reasoningModeMenuRef,
    setModelMenuOpen,
    setProviderMenuOpen,
    setReasoningModeMenuOpen,
  ]);
}

export function useChatInterfaceStopShortcut(canStop, handleStopTurn) {
  useEffect(() => {
    return DesktopChatInterfaceBindingsRuntime.subscribeToStopShortcut({
      canStop,
      onStop: handleStopTurn,
    });
  }, [canStop, handleStopTurn]);
}

export function useChatInterfaceFindShortcut({
  isFindOpen,
  handleOpenFind,
  handleCloseFind,
}) {
  useEffect(() => {
    return DesktopChatInterfaceBindingsRuntime.subscribeToFindShortcut({
      isFindOpen,
      onOpenFind: handleOpenFind,
      onCloseFind: handleCloseFind,
    });
  }, [handleCloseFind, handleOpenFind, isFindOpen]);
}

export function useChatInterfaceNewChatEvent(handleNewChat) {
  useEffect(() => {
    return subscribeDesktopRuntimeNewChatEvent(handleNewChat);
  }, [handleNewChat]);
}
