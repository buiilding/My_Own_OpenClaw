/**
 * useChatMessageSender Hook.
 * Handles sending user messages with screenshot capture and window management.
 */

import { useCallback, useMemo } from 'react';
import { useChatStore, type ChatMessage } from '../stores/chatStore';
import { IpcBridge, INVOKE_CHANNELS } from '../../../infrastructure/ipc/bridge';
import { useAppConfigContext } from '../../../app/providers/AppContextHooks';
import { buildDeferredQueryModelSelection } from '../../../app/providers/appConfigBackendSync';
import {
  type ChatSendSurface,
  type ReturnToChatboxPolicy,
} from '../policies/messageSendUiPolicy';
import { createConversationRef } from '../utils/session/conversationRef';
import { useChatCommonActions } from './useChatCommonActions';
import { normalizeArtifactImageContentType } from '../../../infrastructure/services/ArtifactImageUtils';
import {
  ensureConversationRefForSend,
  hydrateConversationSessionFromMainSnapshot,
} from '../session/conversationSessionRuntime';
import {
  ensureConversationInferenceSessionHydrated,
  markConversationInferenceSessionLocalOnly,
  markConversationInferenceSessionUnknown,
} from '../session/conversationInferenceSessionRuntime';
import { DesktopLiveTurnRuntimeClient } from '../../../app/runtime/desktopLiveTurnRuntimeClient';
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
import { fetchActiveWorkspaceSelection } from '../../../infrastructure/workspace/workspaceAccess';
import {
  getConversationWorkspaceBinding,
  setConversationWorkspaceBinding,
  workspaceSelectionToBinding,
} from '../../../infrastructure/workspace/conversationWorkspaceBinding';
import { recordUserTranscriptMessage } from '../utils/messageSender/userTranscriptPersistence';
import { DesktopTranscriptSessionRuntimeClient } from '../../../app/runtime/desktopTranscriptSessionRuntimeClient';
import { DesktopSettingsRuntimeClient } from '../../../app/runtime/desktopSettingsRuntimeClient';

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
      text: "Your message wasn't sent because WindieOS isn't connected right now. Try again when the backend reconnects.",
      sender: 'assistant',
      type: 'error',
      sourceEventType: 'renderer-compose',
      sourceChannel: 'renderer-local',
      isComplete: true,
    }, conversationRef);
  }, [addMessage]);

  const hydrateSessionFromMainSnapshot = useCallback(async (): Promise<string | null> => {
    const snapshot = await hydrateConversationSessionFromMainSnapshot({
      loadMainSessionSnapshot: () => IpcBridge.invoke(INVOKE_CHANNELS.GET_CLIENT_USER_ID),
      setTranscriptConversationRef: DesktopTranscriptSessionRuntimeClient.setActiveConversationRef,
      setChatConversationRef: setChatActiveConversationRef,
      updateTranscriptSession: DesktopTranscriptSessionRuntimeClient.updateTranscriptSession,
      markConversationInferenceSessionUnknown,
      onError: (error) => {
        console.warn('[useChatMessageSender] Failed to load startup session snapshot:', error);
      },
    });
    return snapshot.conversationRef;
  }, [setChatActiveConversationRef]);

  const ensureConversationRef = useCallback(async (): Promise<string> => {
    return ensureConversationRefForSend({
      transcriptConversationRef: DesktopTranscriptSessionRuntimeClient.getActiveConversationRef(),
      storeConversationRef: useChatStore.getState().activeConversationRef,
      setTranscriptConversationRef: DesktopTranscriptSessionRuntimeClient.setActiveConversationRef,
      setChatConversationRef: setChatActiveConversationRef,
      hydrateMainSessionSnapshot: async () => {
        const conversationRef = await hydrateSessionFromMainSnapshot();
        return {
          conversationRef,
          userId: DesktopTranscriptSessionRuntimeClient.getTranscriptSessionInfo().userId,
        };
      },
      createConversationRef,
      markConversationInferenceSessionLocalOnly,
    });
  }, [hydrateSessionFromMainSnapshot, setChatActiveConversationRef]);

  const ensureConversationWorkspaceBinding = useCallback(async (conversationRef: string) => {
    const existingBinding = getConversationWorkspaceBinding(conversationRef);
    if (existingBinding.workspacePath) {
      return existingBinding;
    }

    try {
      const selection = await fetchActiveWorkspaceSelection();
      return setConversationWorkspaceBinding(
        conversationRef,
        workspaceSelectionToBinding(selection.workspace),
      );
    } catch (_error) {
      return setConversationWorkspaceBinding(conversationRef, null);
    }
  }, []);

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
    const workspaceBinding = await ensureConversationWorkspaceBinding(conversationRef);
    const sessionInfo = DesktopTranscriptSessionRuntimeClient.getTranscriptSessionInfo();
    await ensureConversationInferenceSessionHydrated({
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

    if (senderSurface === 'overlay-chatbox') {
      try {
        await IpcBridge.invoke(INVOKE_CHANNELS.PRIME_RESPONSE_OVERLAY_AWAITING);
      } catch (error) {
        console.warn('[useChatMessageSender] Failed to prime response overlay awaiting state:', error);
      }
    }

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

    // Send query with screenshot to backend
    try {
      const deferredQueryModelSelection = buildDeferredQueryModelSelection(config);
      if (deferredQueryModelSelection) {
        DesktopSettingsRuntimeClient.setModel(deferredQueryModelSelection);
      }
      recordUserTranscriptMessage({
        text,
        conversationRef,
        userId: sessionInfo.userId,
        timestamp: messageTimestamp,
        screenshotRef,
      });
      await DesktopLiveTurnRuntimeClient.sendQuery({
        text,
        conversationRef,
        screenshotRef,
        screenshotUrl,
        screenshotRefs: screenshotRefs.length > 0 ? screenshotRefs : null,
        captureMeta,
        attachmentContext,
        attachmentFilenames: attachmentFilenames.length > 0 ? attachmentFilenames : null,
        workspacePath: workspaceBinding.workspacePath || null,
      });
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
    senderSurface,
    shouldReturnToChatboxOnSend,
    sendLifecycle,
    ensureConversationRef,
    ensureConversationWorkspaceBinding,
    config,
  ]);

  return { sendMessage };
}
