/**
 * Provides the use chat interface bindings module for the renderer UI.
 */

import { useEffect } from 'react';
import { DesktopAudioRuntimeClient } from '../../../app/runtime/desktopAudioRuntimeClient';
import { DesktopShortcutRuntimeClient } from '../../../app/runtime/desktopShortcutRuntimeClient';
import { subscribeDesktopRuntimeNewChatEvent } from '../../../app/runtime/desktopChatEvents';

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
    const handlePointerDown = (event) => {
      if (providerMenuRef.current && !providerMenuRef.current.contains(event.target)) {
        setProviderMenuOpen(false);
      }
      if (modelMenuRef.current && !modelMenuRef.current.contains(event.target)) {
        setModelMenuOpen(false);
      }
      if (
        reasoningModeMenuRef
        && reasoningModeMenuRef.current
        && !reasoningModeMenuRef.current.contains(event.target)
      ) {
        setReasoningModeMenuOpen(false);
      }
    };
    window.addEventListener('mousedown', handlePointerDown);
    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
    };
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
    const handleStopShortcut = (event) => {
      if (!canStop || !DesktopShortcutRuntimeClient.isAgentStopShortcutEvent(event)) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      if (typeof event.stopImmediatePropagation === 'function') {
        event.stopImmediatePropagation();
      }
      handleStopTurn();
    };

    window.addEventListener('keydown', handleStopShortcut);
    return () => {
      window.removeEventListener('keydown', handleStopShortcut);
    };
  }, [canStop, handleStopTurn]);
}

export function useChatInterfaceFindShortcut({
  isFindOpen,
  handleOpenFind,
  handleCloseFind,
}) {
  useEffect(() => {
    const handleFindShortcut = (event) => {
      if (event.defaultPrevented) {
        return;
      }

      const lowerKey = typeof event.key === 'string' ? event.key.toLowerCase() : '';
      if ((event.metaKey || event.ctrlKey) && lowerKey === 'f' && !event.altKey) {
        event.preventDefault();
        event.stopPropagation();
        if (typeof event.stopImmediatePropagation === 'function') {
          event.stopImmediatePropagation();
        }
        handleOpenFind();
        return;
      }

      if (event.key === 'Escape' && isFindOpen) {
        event.preventDefault();
        handleCloseFind();
      }
    };

    window.addEventListener('keydown', handleFindShortcut);
    return () => {
      window.removeEventListener('keydown', handleFindShortcut);
    };
  }, [handleCloseFind, handleOpenFind, isFindOpen]);
}

export function useChatInterfaceNewChatEvent(handleNewChat) {
  useEffect(() => {
    return subscribeDesktopRuntimeNewChatEvent(handleNewChat);
  }, [handleNewChat]);
}
