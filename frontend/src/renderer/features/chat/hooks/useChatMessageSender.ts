/**
 * useChatMessageSender Hook.
 * Handles sending user messages with screenshot capture and window management.
 */

import { useCallback, useMemo } from 'react';
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
  updateTranscriptSession,
} from '../../../infrastructure/transcript/TranscriptWriter';
import { useAppConfigContext } from '../../../app/providers/AppContextHooks';
import {
  resolveMessageSendUiBehavior,
  type ChatSendSurface,
  type ReturnToChatboxPolicy,
} from '../policies/messageSendUiPolicy';
import { createConversationRef } from '../utils/conversationRef';
import { useChatCommonActions } from './useChatCommonActions';
import { normalizeArtifactImageContentType } from '../../../infrastructure/services/ArtifactImageUtils';
import {
  normalizeMainSessionSnapshot,
  resolveConversationRefForSend,
} from '../session/conversationSessionRuntime';
import {
  buildScreenshotRefs,
  resolvePrimaryScreenshotAttachment,
  toUploadedArtifactFromCaptureAttachment,
} from '../utils/screenshotAttachmentContract';
import {
  normalizeAttachmentFilenames,
  normalizeOutgoingPayload,
  type OutgoingUserMessagePayload,
} from '../utils/messageSender/chatMessageSenderPayloads';
import { buildReadableFileAttachmentContext } from '../utils/messageSender/readableFileAttachmentContext';
import {
  buildArtifactUploadMeta,
  buildPendingUserMessage,
  hasUserMessages,
  toScreenshotAttachment,
} from '../utils/messageSender/chatMessageSenderUtils';

type ChatMessageSenderOptions = {
  senderSurface?: ChatSendSurface;
  returnToChatboxPolicy?: ReturnToChatboxPolicy;
};

/**
 * Custom hook for sending chat messages.
 * Handles screenshot capture and message sending.
 */
export function useChatMessageSender(
  stopPlayback?: () => void,
  options: ChatMessageSenderOptions = {},
) {
  const { addMessage, updateMessage, setIsSending, setThinkingStatus } = useChatCommonActions();
  const setChatActiveConversationRef = useChatStore((state) => state.setActiveConversationRef);
  const { config } = useAppConfigContext();
  const { senderSurface = 'overlay-chatbox', returnToChatboxPolicy } = options;
  const includeQueryScreenshot = config?.include_query_screenshot ?? true;
  const shouldCaptureQueryScreenshot = senderSurface !== 'main-window' && includeQueryScreenshot;
  const sendUiBehavior = useMemo(() => resolveMessageSendUiBehavior({
    senderSurface,
    returnToChatboxPolicy,
    includeQueryScreenshot: shouldCaptureQueryScreenshot,
  }), [senderSurface, returnToChatboxPolicy, shouldCaptureQueryScreenshot]);
  const shouldReturnToChatboxOnSend = senderSurface === 'main-window'
    ? false
    : sendUiBehavior.shouldReturnToChatboxOnSend;

  const appendSendFailureMessage = useCallback((conversationRef?: string | null) => {
    addMessage({
      id: crypto.randomUUID(),
      text: 'Failed to send message. Please try again.',
      sender: 'assistant',
      type: 'error',
      sourceEventType: 'renderer-compose',
      sourceChannel: 'renderer-local',
      isComplete: true,
    }, conversationRef);
  }, [addMessage]);

  const hydrateSessionFromMainSnapshot = useCallback(async (): Promise<string | null> => {
    try {
      const snapshotPayload = await IpcBridge.invoke(INVOKE_CHANNELS.GET_CLIENT_USER_ID);
      const snapshot = normalizeMainSessionSnapshot(snapshotPayload);
      if (!snapshot.conversationRef && !snapshot.userId) {
        return null;
      }
      if (snapshot.conversationRef) {
        setActiveConversationRef(snapshot.conversationRef);
        setChatActiveConversationRef(snapshot.conversationRef);
      }
      updateTranscriptSession(snapshot.conversationRef, snapshot.userId);
      return snapshot.conversationRef;
    } catch (error) {
      console.warn('[useChatMessageSender] Failed to load startup session snapshot:', error);
      return null;
    }
  }, [setChatActiveConversationRef]);

  const ensureConversationRef = useCallback(async (): Promise<string> => {
    const resolvedConversationRef = resolveConversationRefForSend(
      getActiveConversationRef(),
      useChatStore.getState().activeConversationRef,
    );
    if (resolvedConversationRef.conversationRef) {
      if (resolvedConversationRef.source === 'store') {
        setActiveConversationRef(resolvedConversationRef.conversationRef);
      }
      setChatActiveConversationRef(resolvedConversationRef.conversationRef);
      return resolvedConversationRef.conversationRef;
    }

    const hydratedConversationRef = await hydrateSessionFromMainSnapshot();
    if (hydratedConversationRef) {
      return hydratedConversationRef;
    }

    const generatedRef = createConversationRef();
    setActiveConversationRef(generatedRef);
    setChatActiveConversationRef(generatedRef);
    return generatedRef;
  }, [hydrateSessionFromMainSnapshot, setChatActiveConversationRef]);

  const sendMessage = useCallback(async (payload: OutgoingUserMessagePayload) => {
    const normalizedPayload = normalizeOutgoingPayload(payload);
    if (!normalizedPayload) {
      return;
    }

    const text = normalizedPayload.text;
    const clipboardImages = normalizedPayload.clipboardImages;
    const readableFiles = normalizedPayload.readableFiles;
    const firstClipboardImage = clipboardImages[0] || null;
    const attachmentFilenames = normalizeAttachmentFilenames(clipboardImages, readableFiles);

    // Stop audio playback if provided
    if (stopPlayback) {
      stopPlayback();
    }

    const hadUserMessages = hasUserMessages(useChatStore.getState().messages);
    const conversationRef = await ensureConversationRef();
    
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
      attachmentFilenames: attachmentFilenames.length > 0 ? attachmentFilenames : null,
      timestamp: messageTimestamp,
    };
    
    // Display message immediately
    addMessage(userMessage, conversationRef);
    setIsSending(true, conversationRef);
    setThinkingStatus(null, conversationRef);

    if (shouldReturnToChatboxOnSend) {
      try {
        await IpcBridge.invoke(INVOKE_CHANNELS.SHOW_CHATBOX, { focus: false });
      } catch (error) {
        console.warn('[useChatMessageSender] Failed to show chatbox:', error);
      }
    }
    
    let screenshot: string | null = firstClipboardImage?.base64 || null;
    let autoCapturedScreenshotRef: string | null = null;
    let autoCapturedScreenshotUrl: string | null = null;
    let screenshotContentType: string | null = userMessageScreenshotContentType;
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
        autoCapturedScreenshotRef = osStateResult.screenshotRef || null;
        autoCapturedScreenshotUrl = osStateResult.screenshotUrl || null;
        screenshotContentType = osStateResult.screenshotContentType;
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
    } else {
      const autoCapturedAttachment = toUploadedArtifactFromCaptureAttachment({
        screenshotRef: autoCapturedScreenshotRef,
        screenshotUrl: autoCapturedScreenshotUrl,
      });
      if (autoCapturedAttachment) {
        uploadedArtifacts.push(autoCapturedAttachment);
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
    const fallbackAttachment = toScreenshotAttachment(uploadedArtifacts[0] || null);
    const primaryAttachment = resolvePrimaryScreenshotAttachment(
      uploadedScreenshotEntries,
      fallbackAttachment,
    );
    const screenshotRef = primaryAttachment.screenshotRef;
    const screenshotUrl = primaryAttachment.screenshotUrl;
    const screenshotRefs = buildScreenshotRefs(uploadedScreenshotEntries, screenshotRef);
    
    // Update message with screenshot
    updateMessage(userMessage.id, {
      screenshotRef,
      screenshotUrl,
      screenshots: uploadedScreenshotEntries.length > 0 ? uploadedScreenshotEntries : null,
    }, conversationRef);

    const sessionInfo = getTranscriptSessionInfo();
    const attachmentContext = await buildReadableFileAttachmentContext(readableFiles);

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
        captureMeta,
        attachmentContext,
        attachmentFilenames.length > 0 ? attachmentFilenames : null,
      );
    } catch (error) {
      console.error('[useChatMessageSender] Failed to send query:', error);
      setIsSending(false, conversationRef);
      appendSendFailureMessage(conversationRef);
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
