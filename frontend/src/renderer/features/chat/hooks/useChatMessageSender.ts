/**
 * useChatMessageSender Hook.
 * Handles sending user messages with screenshot capture and window management.
 */

import { useCallback } from 'react';
import { ApiClient } from '../../../infrastructure/api/client';
import { useChatStore, type ChatMessage } from '../stores/chatStore';
import { extractOSstate } from '../../../infrastructure/services/SystemCapture';
import { IpcBridge, INVOKE_CHANNELS } from '../../../infrastructure/ipc/bridge';
import { uploadArtifactBase64 } from '../../../infrastructure/services/ArtifactUploader';

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
  const addMessage = useChatStore((state) => state.addMessage);
  const updateMessage = useChatStore((state) => state.updateMessage);
  const setIsSending = useChatStore((state) => state.setIsSending);
  const setThinkingStatus = useChatStore((state) => state.setThinkingStatus);
  const { returnToChatboxOnSend = false } = options;

  const appendSendFailureMessage = useCallback(() => {
    addMessage({
      id: crypto.randomUUID(),
      text: 'Failed to send message. Please try again.',
      sender: 'assistant',
      type: 'error',
      isComplete: true,
    });
  }, [addMessage]);

  const sendMessage = useCallback(async (text: string) => {
    // Stop audio playback if provided
    if (stopPlayback) {
      stopPlayback();
    }

    const hadUserMessages = useChatStore
      .getState()
      .messages
      .some((msg) => msg.sender === 'user');
    
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
    const isFirstUserMessage = !hadUserMessages;
    
    let screenshot: string | null = null;
    let screenshotContentType: string | null = null;
    let systemState: any = null;
    try {
      const osStateResult = await extractOSstate(
        true,  // enable_screenshot
        true,  // enable_system_state
        0,     // wait (0 seconds for user messages)
        isFirstUserMessage  // is_first_user_message
      );
      
      screenshot = osStateResult.screenshot;
      screenshotContentType = osStateResult.screenshotContentType;
      systemState = osStateResult.systemState;
    } catch (error) {
      console.error('[useChatMessageSender] Failed to extract OS state:', error);
      // Continue without screenshot/system state if capture fails
    }

    let uploaded = null;
    if (screenshot) {
      try {
        uploaded = await uploadArtifactBase64(
          screenshot,
          screenshotContentType || 'image/jpeg',
          `user-message.${(screenshotContentType || '').includes('png') ? 'png' : 'jpg'}`
        );
      } catch (error) {
        console.warn('[useChatMessageSender] Failed to upload screenshot artifact:', error);
      }
    }
    const screenshotRef = uploaded?.artifactId || null;
    const screenshotUrl = uploaded?.url || null;
    
    // Update message with screenshot
    updateMessage(userMessage.id, { screenshotRef, screenshotUrl });
    
    // Send query with screenshot to backend
    try {
      await ApiClient.sendQuery(text, screenshotRef, screenshotUrl);
    } catch (error) {
      console.error('[useChatMessageSender] Failed to send query:', error);
      setIsSending(false);
      appendSendFailureMessage();
      throw error;
    }
  }, [
    addMessage,
    appendSendFailureMessage,
    updateMessage,
    setIsSending,
    setThinkingStatus,
    stopPlayback,
    returnToChatboxOnSend,
  ]);

  return { sendMessage };
}
