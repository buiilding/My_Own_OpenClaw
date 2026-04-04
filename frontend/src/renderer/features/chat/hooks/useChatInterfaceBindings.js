import { useEffect } from 'react';
import { IpcBridge, ON_CHANNELS } from '../../../infrastructure/ipc/bridge';
import { extractAudioChunkPayload } from '../utils/backendAudioEvents';
import { isAgentStopShortcutEvent } from '../../../infrastructure/shortcuts/agentStopShortcut';

export function useChatInterfaceAudioChunkStream(audioPlayerRef) {
  useEffect(() => {
    const removeListener = IpcBridge.on(ON_CHANNELS.FROM_BACKEND, (data) => {
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
