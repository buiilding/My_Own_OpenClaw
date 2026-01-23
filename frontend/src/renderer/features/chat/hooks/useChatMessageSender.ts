/**
 * useChatMessageSender Hook.
 * Handles sending user messages with screenshot capture and window management.
 */

import { useCallback } from 'react';
import { IpcBridge, INVOKE_CHANNELS } from '../../../infrastructure/ipc/bridge';
import { ApiClient } from '../../../infrastructure/api/client';
import { useChatStore, type ChatMessage } from '../stores/chatStore';

/**
 * Custom hook for sending chat messages.
 * Handles screenshot capture, window minimization, and message sending.
 */
export function useChatMessageSender(stopPlayback?: () => void) {
  const { addMessage, setIsSending, setThinkingStatus } = useChatStore();

  const sendMessage = useCallback(async (text: string) => {
    // Stop audio playback if provided
    if (stopPlayback) {
      stopPlayback();
    }
    
    // Minimize window after 2 seconds delay (if visible/focused and not already minimized)
    // This happens BEFORE screenshot so the chat window isn't in the screenshot
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
    
    // Create user message with screenshot for UI display
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      text,
      sender: 'user',
      screenshot: screenshot  // Include screenshot for UI display
    };
    
    addMessage(userMessage);
    setIsSending(true);
    setThinkingStatus(null);
    
    // Send query with screenshot to backend
    await ApiClient.sendQuery(text, screenshot);
  }, [addMessage, setIsSending, setThinkingStatus, stopPlayback]);

  return { sendMessage };
}
