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
import {
  getActiveConversationRef,
  getTranscriptSessionInfo,
  recordUserMessage,
  setActiveConversationRef,
} from '../../../infrastructure/transcript/TranscriptWriter';
import {
  buildArtifactUploadMeta,
  buildPendingUserMessage,
  hasUserMessages,
  toScreenshotAttachment,
} from '../utils/chatMessageSenderUtils';
import { useAppConfigContext } from '../../../app/providers/AppContextHooks';

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
  const { config } = useAppConfigContext();
  const { returnToChatboxOnSend = false } = options;
  const includeQueryScreenshot = config?.include_query_screenshot ?? true;

  const appendSendFailureMessage = useCallback(() => {
    addMessage({
      id: crypto.randomUUID(),
      text: 'Failed to send message. Please try again.',
      sender: 'assistant',
      type: 'error',
      isComplete: true,
    });
  }, [addMessage]);

  const ensureConversationRef = useCallback((): string => {
    const activeRef = getActiveConversationRef();
    if (activeRef) {
      return activeRef;
    }
    const generatedRef = `conv_${crypto.randomUUID()}`;
    setActiveConversationRef(generatedRef);
    return generatedRef;
  }, []);

  const sendMessage = useCallback(async (text: string) => {
    // Stop audio playback if provided
    if (stopPlayback) {
      stopPlayback();
    }

    const hadUserMessages = hasUserMessages(useChatStore.getState().messages);
    const conversationRef = ensureConversationRef();
    
    // Create user message immediately (without screenshot) for instant UI display
    const userMessageId = crypto.randomUUID();
    const messageTimestamp = new Date().toISOString();
    const userMessage: ChatMessage = {
      ...buildPendingUserMessage(userMessageId, text),
      timestamp: messageTimestamp,
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
    
    let screenshot: string | null = null;
    let screenshotContentType: string | null = null;
    if (includeQueryScreenshot) {
      // Extract OS state (screenshot and system state).
      const isFirstUserMessage = !hadUserMessages;
      try {
        const osStateResult = await extractOSstate(
          true,  // enable_screenshot
          false, // enable_system_state (unused for user-message send path)
          0,     // wait (0 seconds for user messages)
          isFirstUserMessage  // is_first_user_message
        );

        screenshot = osStateResult.screenshot;
        screenshotContentType = osStateResult.screenshotContentType;
      } catch (error) {
        console.error('[useChatMessageSender] Failed to extract OS state:', error);
        // Continue without screenshot/system state if capture fails
      }
    }

    let uploaded = null;
    if (screenshot) {
      const artifactUploadMeta = buildArtifactUploadMeta(screenshotContentType);
      try {
        uploaded = await uploadArtifactBase64(
          screenshot,
          artifactUploadMeta.contentType,
          artifactUploadMeta.filename,
        );
      } catch (error) {
        console.warn('[useChatMessageSender] Failed to upload screenshot artifact:', error);
      }
    }
    const { screenshotRef, screenshotUrl } = toScreenshotAttachment(uploaded);
    
    // Update message with screenshot
    updateMessage(userMessage.id, { screenshotRef, screenshotUrl });

    const sessionInfo = getTranscriptSessionInfo();
    recordUserMessage(text, {
      conversationRef,
      userId: sessionInfo.userId,
      timestamp: messageTimestamp,
      screenshotRef,
    });
    
    // Send query with screenshot to backend
    try {
      await ApiClient.sendQuery(text, conversationRef, screenshotRef, screenshotUrl);
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
    includeQueryScreenshot,
    ensureConversationRef,
  ]);

  return { sendMessage };
}
