/**
 * useChatMessageSender Hook.
 * Handles sending user messages with screenshot capture and window management.
 */

import { useCallback } from 'react';
import { IpcBridge, INVOKE_CHANNELS } from '../../../infrastructure/ipc/bridge';
import { ApiClient } from '../../../infrastructure/api/client';
import { useChatStore, type ChatMessage } from '../stores/chatStore';
import { useAppConfigContext } from '../../../app/providers/AppConfigContext';

/**
 * Custom hook for sending chat messages.
 * Handles screenshot capture, window minimization, and message sending.
 */
export function useChatMessageSender(stopPlayback?: () => void) {
  const { addMessage, updateMessage, setIsSending, setThinkingStatus } = useChatStore();
  const { config } = useAppConfigContext();

  const sendMessage = useCallback(async (text: string) => {
    // Stop audio playback if provided
    if (stopPlayback) {
      stopPlayback();
    }
    
    // Create user message immediately (without screenshot) for instant UI display
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      text,
      sender: 'user',
      screenshot: null  // Will be updated after screenshot capture
    };
    
    // Display message immediately
    addMessage(userMessage);
    setIsSending(true);
    setThinkingStatus(null);
    
    // Minimize window after 2 seconds delay (if visible/focused and not already minimized)
    // This happens AFTER message display so user sees their message immediately
    // The delay ensures the chat window isn't in the screenshot
    try {
      await IpcBridge.invoke(INVOKE_CHANNELS.MINIMIZE_WINDOW_DELAYED);
    } catch (error) {
      console.error('[useChatMessageSender] Failed to minimize window:', error);
      // Continue even if minimize fails
    }
    
    // Take screenshot after window is minimized
    let screenshot: string | null = null;
    try {
      const screenshotResult = await IpcBridge.invoke<any>(INVOKE_CHANNELS.EXECUTE_TOOL, {
        toolName: 'screenshot',
        args: {
          explanation: 'User message screenshot',
          expectation: 'Current screen state'
        },
        skipAutoCapture: false
      });
      
      if (screenshotResult.success && screenshotResult.data?.screenshot) {
        screenshot = screenshotResult.data.screenshot;
      }
    } catch (error) {
      console.error('[useChatMessageSender] Failed to capture screenshot:', error);
      // Continue without screenshot if capture fails
    }
    
    // Update message with screenshot
    updateMessage(userMessage.id, { screenshot });
    
    // Send query with screenshot and config to backend
    // Send entire config object - backend will apply whatever fields are present
    const configToSend = config || {};
    console.log('[Query Send] Sending config to backend:', {
      model_mode: configToSend.model_mode,
      model_provider: configToSend.model_provider,
      selected_model_id: configToSend.selected_model_id,
      speech_mode_enabled: configToSend.speech_mode_enabled,
      voice_mode_enabled: configToSend.voice_mode_enabled,
      full_config: configToSend
    });
    await ApiClient.sendQuery(text, screenshot, configToSend);
  }, [addMessage, updateMessage, setIsSending, setThinkingStatus, stopPlayback, config]);

  return { sendMessage };
}
