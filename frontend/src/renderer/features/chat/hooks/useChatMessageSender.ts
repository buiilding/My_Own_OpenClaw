/**
 * useChatMessageSender Hook.
 * Handles sending user messages with screenshot capture and window management.
 */

import { useCallback } from 'react';
import { ApiClient } from '../../../infrastructure/api/client';
import { useChatStore, type ChatMessage } from '../stores/chatStore';
import { extractOSstate } from '../../../infrastructure/services/SystemCapture';
import { IpcBridge, INVOKE_CHANNELS } from '../../../infrastructure/ipc/bridge';

type ChatMessageSenderOptions = {
  returnToChatboxOnSend?: boolean;
};

/**
 * Custom hook for sending chat messages.
 * Handles screenshot capture and message sending.
 */
export function useChatMessageSender(
  stopPlayback?: () => void,
  options: ChatMessageSenderOptions = {},
) {
  const { addMessage, updateMessage, setIsSending, setThinkingStatus } = useChatStore();
  const { returnToChatboxOnSend = false } = options;

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

    if (returnToChatboxOnSend) {
      try {
        await IpcBridge.invoke(INVOKE_CHANNELS.SHOW_CHATBOX, { focus: false });
      } catch (error) {
        console.warn('[useChatMessageSender] Failed to show chatbox:', error);
      }
    }
    
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
    
    // Send query with screenshot to backend
    await ApiClient.sendQuery(text, screenshot);
  }, [addMessage, updateMessage, setIsSending, setThinkingStatus, stopPlayback, returnToChatboxOnSend]);

  return { sendMessage };
}
