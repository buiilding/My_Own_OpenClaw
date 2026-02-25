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
import {
  resolveMessageSendUiBehavior,
  type ChatSendSurface,
  type ReturnToChatboxPolicy,
} from '../policies/messageSendUiPolicy';
import { createConversationRef } from '../utils/conversationRef';
import { useChatCommonActions } from './useChatCommonActions';
import { normalizeArtifactImageContentType } from '../../../infrastructure/services/ArtifactImageUtils';

type ChatMessageSenderOptions = {
  senderSurface?: ChatSendSurface;
  returnToChatboxPolicy?: ReturnToChatboxPolicy;
};

type ClipboardImagePayload = {
  base64: string;
  contentType?: string | null;
  filename?: string | null;
};

type OutgoingUserMessagePayload = string | {
  text: string;
  clipboardImage?: ClipboardImagePayload | null;
};

function normalizeOutgoingPayload(payload: OutgoingUserMessagePayload): {
  text: string;
  clipboardImage: ClipboardImagePayload | null;
} | null {
  if (typeof payload === 'string') {
    return { text: payload, clipboardImage: null };
  }

  if (!payload || typeof payload !== 'object' || typeof payload.text !== 'string') {
    return null;
  }

  const clipboardImage = payload.clipboardImage;
  const hasClipboardImage = Boolean(
    clipboardImage
    && typeof clipboardImage.base64 === 'string'
    && clipboardImage.base64.length > 0,
  );

  return {
    text: payload.text,
    clipboardImage: hasClipboardImage ? clipboardImage : null,
  };
}

/**
 * Custom hook for sending chat messages.
 * Handles screenshot capture and message sending.
 */
export function useChatMessageSender(
  stopPlayback?: () => void,
  options: ChatMessageSenderOptions = {},
) {
  const { addMessage, updateMessage, setIsSending, setThinkingStatus } = useChatCommonActions();
  const { config } = useAppConfigContext();
  const { senderSurface = 'overlay-chatbox', returnToChatboxPolicy } = options;
  const includeQueryScreenshot = config?.include_query_screenshot ?? true;
  const shouldCaptureQueryScreenshot = senderSurface !== 'main-window' && includeQueryScreenshot;
  const sendUiBehavior = resolveMessageSendUiBehavior({
    senderSurface,
    returnToChatboxPolicy,
    includeQueryScreenshot: shouldCaptureQueryScreenshot,
  });
  const shouldReturnToChatboxOnSend = senderSurface === 'main-window'
    ? false
    : sendUiBehavior.shouldReturnToChatboxOnSend;

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
    const generatedRef = createConversationRef();
    setActiveConversationRef(generatedRef);
    return generatedRef;
  }, []);

  const sendMessage = useCallback(async (payload: OutgoingUserMessagePayload) => {
    const normalizedPayload = normalizeOutgoingPayload(payload);
    if (!normalizedPayload) {
      return;
    }

    const text = normalizedPayload.text;
    const clipboardImage = normalizedPayload.clipboardImage;

    // Stop audio playback if provided
    if (stopPlayback) {
      stopPlayback();
    }

    const hadUserMessages = hasUserMessages(useChatStore.getState().messages);
    const conversationRef = ensureConversationRef();
    
    // Create user message immediately for instant UI display
    const userMessageId = crypto.randomUUID();
    const messageTimestamp = new Date().toISOString();
    const userMessageScreenshotContentType = clipboardImage
      ? normalizeArtifactImageContentType(clipboardImage.contentType)
      : null;
    const userMessage: ChatMessage = {
      ...buildPendingUserMessage(userMessageId, text),
      screenshot: clipboardImage?.base64 || null,
      screenshotContentType: userMessageScreenshotContentType,
      timestamp: messageTimestamp,
    };
    
    // Display message immediately
    addMessage(userMessage);
    setIsSending(true);
    setThinkingStatus(null);

    if (shouldReturnToChatboxOnSend) {
      try {
        await IpcBridge.invoke(INVOKE_CHANNELS.SHOW_CHATBOX, { focus: false });
      } catch (error) {
        console.warn('[useChatMessageSender] Failed to show chatbox:', error);
      }
    }
    
    let screenshot: string | null = clipboardImage?.base64 || null;
    let screenshotContentType: string | null = userMessageScreenshotContentType;
    const screenshotFilename: string | null = clipboardImage?.filename || null;
    if (!screenshot && shouldCaptureQueryScreenshot) {
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
          screenshotFilename || artifactUploadMeta.filename,
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
    shouldReturnToChatboxOnSend,
    shouldCaptureQueryScreenshot,
    ensureConversationRef,
  ]);

  return { sendMessage };
}
