/**
 * useChatMessageSender Hook.
 * Handles sending user messages with screenshot capture and window management.
 */

import { useCallback } from 'react';
import { ApiClient } from '../../../infrastructure/api/client';
import { useChatStore, type ChatMessage } from '../stores/chatStore';
import { useAppConfigContext } from '../../../app/providers/AppConfigContext';
import { extractOSstate } from '../../../infrastructure/services/SystemCapture';

/**
 * Custom hook for sending chat messages.
 * Handles screenshot capture and message sending.
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
    
    // Extract OS state (screenshot and system state).
    // Determine if this is the first user message
    const isFirstUserMessage = !useChatStore.getState().messages.some(msg => msg.sender === 'user');
    
    let screenshot: string | null = null;
    let systemState: any = null;
    try {
      const osStateResult = await extractOSstate(
        true,  // enable_screenshot
        true,  // enable_system_state
        0,     // wait (0 seconds for user messages)
        isFirstUserMessage  // is_first_user_message
      );
      
      screenshot = osStateResult.screenshot;
      systemState = osStateResult.systemState;
    } catch (error) {
      console.error('[useChatMessageSender] Failed to extract OS state:', error);
      // Continue without screenshot/system state if capture fails
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
