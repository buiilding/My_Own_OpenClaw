/**
 * useChatMessageSender Hook.
 * Handles sending user messages with screenshot capture and window management.
 */

import { useCallback, useMemo } from 'react';
import { ApiClient } from '../../../infrastructure/api/client';
import { useChatStore, type ChatMessage } from '../stores/chatStore';
import { IpcBridge, INVOKE_CHANNELS } from '../../../infrastructure/ipc/bridge';
import {
  getActiveConversationRef,
  getTranscriptSessionInfo,
  recordUserMessage,
  setActiveConversationRef,
  updateTranscriptSession,
} from '../../../infrastructure/transcript/TranscriptWriter';
import { useAppConfigContext } from '../../../app/providers/AppContextHooks';
import { buildDeferredQueryModelConfig } from '../../../app/providers/appConfigBackendSync';
import {
  type ChatSendSurface,
  type ReturnToChatboxPolicy,
} from '../policies/messageSendUiPolicy';
import { createConversationRef } from '../utils/session/conversationRef';
import { useChatCommonActions } from './useChatCommonActions';
import { normalizeArtifactImageContentType } from '../../../infrastructure/services/ArtifactImageUtils';
import {
  applyMainSessionSnapshot,
  normalizeMainSessionSnapshot,
  resolveConversationRefForSend,
} from '../session/conversationSessionRuntime';
import {
  ensureConversationBackendState,
  markConversationBackendStateFreshLocal,
  markConversationBackendStateUnknown,
} from '../session/conversationBackendSyncRuntime';
import {
  normalizeAttachmentFilenames,
  normalizeOutgoingPayload,
  type OutgoingUserMessagePayload,
} from '../utils/messageSender/chatMessageSenderPayloads';
import { buildReadableFileAttachmentContext } from '../utils/messageSender/readableFileAttachmentContext';
import {
  buildPendingUserMessage,
  hasUserMessages,
} from '../utils/messageSender/chatMessageSenderUtils';
import { resolveQueryScreenshotArtifacts } from '../utils/messageSender/queryScreenshotPipeline';
import { resolveChatPillSendLifecycle } from '../utils/chatPill/chatPillSessionFlow';
import { logRendererChatPillTrace } from '../utils/chatStream/chatStreamDebugTrace';

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
  const sendLifecycle = useMemo(() => resolveChatPillSendLifecycle({
    senderSurface,
    returnToChatboxPolicy,
    includeQueryScreenshot,
  }), [includeQueryScreenshot, returnToChatboxPolicy, senderSurface]);
  const shouldReturnToChatboxOnSend = sendLifecycle.shouldReturnToChatboxOnSend;

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
      const appliedSnapshot = applyMainSessionSnapshot(snapshot, {
        setTranscriptConversationRef: setActiveConversationRef,
        setChatConversationRef: setChatActiveConversationRef,
        updateTranscriptSession,
      });
      markConversationBackendStateUnknown(appliedSnapshot.conversationRef);
      return appliedSnapshot.conversationRef;
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
    markConversationBackendStateFreshLocal(generatedRef);
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
    const sessionInfo = getTranscriptSessionInfo();
    await ensureConversationBackendState({
      conversationRef,
      userId: sessionInfo.userId,
    });
    
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
    logRendererChatPillTrace({
      source: 'renderer-send',
      action: 'send-start',
      turn_id: userMessageId,
      include_query_screenshot: sendLifecycle.shouldCaptureQueryScreenshot,
      reason: sendLifecycle.surfaceReason,
    }, conversationRef);

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
    
    const {
      captureMeta,
      uploadedScreenshotEntries,
      screenshotRef,
      screenshotUrl,
      screenshotRefs,
    } = await resolveQueryScreenshotArtifacts({
      clipboardImages,
      shouldCaptureQueryScreenshot: sendLifecycle.shouldCaptureQueryScreenshot,
      isFirstUserMessage: !hadUserMessages,
      traceContext: {
        conversationRef,
        turnId: userMessageId,
        surfaceReason: sendLifecycle.surfaceReason,
      },
    });
    
    // Update message with screenshot
    updateMessage(userMessage.id, {
      screenshotRef,
      screenshotUrl,
      screenshots: uploadedScreenshotEntries.length > 0 ? uploadedScreenshotEntries : null,
    }, conversationRef);

    const attachmentContext = await buildReadableFileAttachmentContext(readableFiles);

    recordUserMessage(text, {
      conversationRef,
      userId: sessionInfo.userId,
      timestamp: messageTimestamp,
      screenshotRef,
    });
    
    // Send query with screenshot to backend
    try {
      const deferredQueryModelConfig = buildDeferredQueryModelConfig(config);
      if (deferredQueryModelConfig) {
        ApiClient.updateSettings(deferredQueryModelConfig);
      }
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
      logRendererChatPillTrace({
        source: 'renderer-send',
        action: 'query-dispatched',
        turn_id: userMessageId,
        include_query_screenshot: sendLifecycle.shouldCaptureQueryScreenshot,
        reason: sendLifecycle.surfaceReason,
      }, conversationRef);
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
    sendLifecycle,
    ensureConversationRef,
    config,
  ]);

  return { sendMessage };
}
