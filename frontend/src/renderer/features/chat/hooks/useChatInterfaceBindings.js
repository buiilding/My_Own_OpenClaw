/**
 * Provides the use chat interface bindings module for the renderer UI.
 */

import { useEffect } from 'react';
import { IpcBridge, ON_CHANNELS } from '../../../infrastructure/ipc/bridge';
import { extractAudioChunkPayload } from '../utils/audioChunkEvents';
import { isAgentStopShortcutEvent } from '../../../infrastructure/shortcuts/agentStopShortcut';

export function useChatInterfaceAudioChunkStream(audioPlayerRef) {
  useEffect(() => {
    const removeListener = IpcBridge.on(ON_CHANNELS.AUDIO_CHUNK, (data) => {
      const audioChunk = extractAudioChunkPayload(data);
      if (audioChunk && audioPlayerRef.current) {
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

export function useChatInterfaceStopShortcut(canStop, handleStopQuery) {
  useEffect(() => {
    const handleStopShortcut = (event) => {
      if (!canStop || !isAgentStopShortcutEvent(event)) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      if (typeof event.stopImmediatePropagation === 'function') {
        event.stopImmediatePropagation();
      }
      handleStopQuery();
    };

    window.addEventListener('keydown', handleStopShortcut);
    return () => {
      window.removeEventListener('keydown', handleStopShortcut);
    };
  }, [canStop, handleStopQuery]);
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
    const handleDashboardNewChat = () => {
      handleNewChat();
    };
    window.addEventListener('windie:new-chat', handleDashboardNewChat);
    return () => {
      window.removeEventListener('windie:new-chat', handleDashboardNewChat);
    };
  }, [handleNewChat]);
}
