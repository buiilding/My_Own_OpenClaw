import { useEffect } from 'react';
import { useStreamingMessages } from './useStreamingMessages';
import { useSettingsManagement } from './useSettingsManagement';

/**
 * Custom hook for handling all backend messages.
 * Combines streaming message handling and settings management.
 *
 * @param {Function} setMessages - Function to update messages state
 * @param {Function} setIsSending - Function to update sending state
 * @param {Function} setThinkingStatus - Function to update thinking status
 * @param {Function} setConfig - Function to update config state
 * @param {Function} setAvailableModels - Function to update available models state
 * @param {Function} setSaveStatus - Function to update save status state
 * @param {Object} configBeforeSave - Ref to store config before save attempt
 * @param {Object} saveTimeoutId - Ref to store timeout ID
 * @returns {Object} - Cleanup function for removing listeners
 */
export function useMessageHandling(
  setMessages,
  setIsSending,
  setThinkingStatus,
  setConfig,
  setAvailableModels,
  setSaveStatus,
  configBeforeSave,
  saveTimeoutId
) {
  const streamingHandlers = useStreamingMessages(
    setMessages,
    setIsSending,
    setThinkingStatus
  );

  const settingsHandlers = useSettingsManagement(
    setConfig,
    setAvailableModels,
    setSaveStatus,
    configBeforeSave,
    saveTimeoutId
  );

  useEffect(() => {
    const removeBackendListener = window.ipc.on('from-backend', (data) => {
      if (data.type === 'pong' || data.type === 'response') {
        streamingHandlers.handlePongResponse(data);
      } else if (data.type === 'llm-thought') {
        streamingHandlers.handleLlmThought(data);
      } else if (data.type === 'streaming-response') {
        streamingHandlers.handleStreamingResponse(data);
      } else if (data.type === 'streaming-complete') {
        streamingHandlers.handleStreamingComplete();
      } else if (data.type === 'settings-loaded') {
        settingsHandlers.handleSettingsLoaded(data);
      } else if (data.type === 'models-listed') {
        settingsHandlers.handleModelsListed(data);
      } else if (data.type === 'settings-updated') {
        settingsHandlers.handleSettingsUpdated();
      } else if (
        data.type === 'error' &&
        data.payload.message?.includes('Failed to update settings')
      ) {
        settingsHandlers.handleSettingsError(data);
      }
    });

    return () => {
      removeBackendListener();
      clearTimeout(saveTimeoutId.current); // Cleanup on unmount
    };
  }, [
    streamingHandlers,
    settingsHandlers,
    saveTimeoutId,
  ]);

  return {};
}
