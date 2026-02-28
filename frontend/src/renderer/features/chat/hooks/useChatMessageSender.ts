/**
 * useChatMessageSender Hook.
 * Handles sending user messages with screenshot capture and window management.
 */

import { useCallback } from 'react';
import { ApiClient } from '../../../infrastructure/api/client';
import { useChatStore, type ChatMessage } from '../stores/chatStore';
import { extractOSstate, type CaptureMeta } from '../../../infrastructure/services/SystemCapture';
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
  clipboardImages?: ClipboardImagePayload[] | null;
};

function normalizeOutgoingPayload(payload: OutgoingUserMessagePayload): {
  text: string;
  clipboardImages: ClipboardImagePayload[];
} | null {
  const normalizeClipboardImage = (
    clipboardImage: ClipboardImagePayload | null | undefined,
  ): ClipboardImagePayload | null => {
    const hasClipboardImage = Boolean(
      clipboardImage
      && typeof clipboardImage.base64 === 'string'
      && clipboardImage.base64.length > 0,
    );
    return hasClipboardImage ? clipboardImage : null;
  };

  if (typeof payload === 'string') {
    return { text: payload, clipboardImages: [] };
  }

  if (!payload || typeof payload !== 'object' || typeof payload.text !== 'string') {
    return null;
  }

  const normalizedClipboardImages = Array.isArray(payload.clipboardImages)
    ? payload.clipboardImages
      .map((clipboardImage) => normalizeClipboardImage(clipboardImage))
      .filter((clipboardImage): clipboardImage is ClipboardImagePayload => Boolean(clipboardImage))
    : [];

  const legacyClipboardImage = normalizeClipboardImage(payload.clipboardImage);
  if (legacyClipboardImage) {
    normalizedClipboardImages.push(legacyClipboardImage);
  }

  return {
    text: payload.text,
    clipboardImages: normalizedClipboardImages,
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
      sourceEventType: 'renderer-compose',
      sourceChannel: 'renderer-local',
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
    const clipboardImages = normalizedPayload.clipboardImages;
    const firstClipboardImage = clipboardImages[0] || null;

    // Stop audio playback if provided
    if (stopPlayback) {
      stopPlayback();
    }

    const hadUserMessages = hasUserMessages(useChatStore.getState().messages);
    const conversationRef = ensureConversationRef();
    
    // Create user message immediately for instant UI display
    const userMessageId = crypto.randomUUID();
    const messageTimestamp = new Date().toISOString();
    const userMessageScreenshotContentType = firstClipboardImage
      ? normalizeArtifactImageContentType(firstClipboardImage.contentType)
      : null;
    const userMessageScreenshots = clipboardImages.map((clipboardImage) => ({
      screenshot: clipboardImage.base64,
      screenshotContentType: normalizeArtifactImageContentType(clipboardImage.contentType),
      screenshotRef: null,
      screenshotUrl: null,
    }));
    const userMessage: ChatMessage = {
      ...buildPendingUserMessage(userMessageId, text),
      sourceEventType: 'renderer-compose',
      sourceChannel: 'renderer-local',
      screenshot: firstClipboardImage?.base64 || null,
      screenshotContentType: userMessageScreenshotContentType,
      screenshots: userMessageScreenshots.length > 0 ? userMessageScreenshots : null,
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
    
    let screenshot: string | null = firstClipboardImage?.base64 || null;
    let screenshotContentType: string | null = userMessageScreenshotContentType;
    let screenshotId: string | null = null;
    let captureMeta: CaptureMeta | null = null;
    const screenshotFilename: string | null = firstClipboardImage?.filename || null;
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
        screenshotId = osStateResult.screenshotId;
        captureMeta = osStateResult.captureMeta;
      } catch (error) {
        console.error('[useChatMessageSender] Failed to extract OS state:', error);
        // Continue without screenshot/system state if capture fails
      }
    }

    const uploadedArtifacts: Array<{ artifactId?: string | null; url?: string | null } | null> = [];
    if (clipboardImages.length > 0) {
      for (const clipboardImage of clipboardImages) {
        const artifactUploadMeta = buildArtifactUploadMeta(clipboardImage.contentType);
        try {
          const uploaded = await uploadArtifactBase64(
            clipboardImage.base64,
            artifactUploadMeta.contentType,
            clipboardImage.filename || artifactUploadMeta.filename,
          );
          uploadedArtifacts.push(uploaded || null);
        } catch (error) {
          console.warn('[useChatMessageSender] Failed to upload screenshot artifact:', error);
          uploadedArtifacts.push(null);
        }
      }
    } else if (screenshot) {
      const artifactUploadMeta = buildArtifactUploadMeta(screenshotContentType);
      try {
        const uploaded = await uploadArtifactBase64(
          screenshot,
          artifactUploadMeta.contentType,
          screenshotFilename || artifactUploadMeta.filename,
        );
        uploadedArtifacts.push(uploaded || null);
      } catch (error) {
        console.warn('[useChatMessageSender] Failed to upload screenshot artifact:', error);
        uploadedArtifacts.push(null);
      }
    }

    const uploadedScreenshotEntries = clipboardImages.map((clipboardImage, index) => {
      const attachment = toScreenshotAttachment(uploadedArtifacts[index] || null);
      return {
        screenshot: clipboardImage.base64,
        screenshotContentType: normalizeArtifactImageContentType(clipboardImage.contentType),
        screenshotRef: attachment.screenshotRef,
        screenshotUrl: attachment.screenshotUrl,
      };
    });
    const uploadedScreenshotRefs = uploadedScreenshotEntries
      .map((entry) => entry.screenshotRef)
      .filter((ref): ref is string => typeof ref === 'string' && ref.length > 0);
    const firstUploadedScreenshotEntry = uploadedScreenshotEntries.find(
      (entry) => typeof entry.screenshotRef === 'string' && entry.screenshotRef.length > 0,
    ) || null;

    const fallbackAttachment = toScreenshotAttachment(uploadedArtifacts[0] || null);
    const screenshotRef = firstUploadedScreenshotEntry?.screenshotRef || fallbackAttachment.screenshotRef;
    const screenshotUrl = firstUploadedScreenshotEntry?.screenshotUrl || fallbackAttachment.screenshotUrl;
    
    // Update message with screenshot
    updateMessage(userMessage.id, {
      screenshotRef,
      screenshotUrl,
      screenshots: uploadedScreenshotEntries.length > 0 ? uploadedScreenshotEntries : null,
    });

    const sessionInfo = getTranscriptSessionInfo();
    const screenshotRefs = uploadedScreenshotRefs.length > 0
      ? uploadedScreenshotRefs
      : (screenshotRef ? [screenshotRef] : []);

    recordUserMessage(text, {
      conversationRef,
      userId: sessionInfo.userId,
      timestamp: messageTimestamp,
      screenshotRef,
    });
    
    // Send query with screenshot to backend
    try {
      await ApiClient.sendQuery(
        text,
        conversationRef,
        screenshotRef,
        screenshotUrl,
        screenshotRefs.length > 0 ? screenshotRefs : null,
        screenshotId,
        captureMeta,
      );
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
