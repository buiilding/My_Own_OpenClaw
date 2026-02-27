import { useCallback } from 'react';
import { ApiClient } from '../../../infrastructure/api/client';
import { IpcBridge, INVOKE_CHANNELS } from '../../../infrastructure/ipc/bridge';
import {
  getActiveConversationRef,
  getTranscriptSessionInfo,
  setActiveConversationRef,
  updateTranscriptSession,
} from '../../../infrastructure/transcript/TranscriptWriter';
import { createConversationRef } from '../utils/conversationRef';
import {
  resolveTranscriptMessageType,
  resolveTranscriptRole,
  toRehydratePayload,
} from '../utils/transcriptMessagePayload';

const TOOL_CALL_MESSAGE_TYPES = new Set(['tool-call', 'tool-bundle']);
const TOOL_OUTPUT_MESSAGE_TYPES = new Set(['tool-output', 'tool-result']);

function normalizeMessageType(message) {
  if (!message || typeof message !== 'object') {
    return '';
  }
  return typeof message.type === 'string'
    ? message.type.trim().toLowerCase()
    : '';
}

function normalizeCorrelationId(value) {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function pickCorrelationIdFromPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return null;
  }
  return (
    normalizeCorrelationId(payload.correlation_id)
    || normalizeCorrelationId(payload.request_id)
    || normalizeCorrelationId(payload.bundle_id)
    || normalizeCorrelationId(payload.id)
    || null
  );
}

function resolveToolMessageCorrelationId(message) {
  if (!message || typeof message !== 'object') {
    return null;
  }
  return (
    normalizeCorrelationId(message.correlationId)
    || pickCorrelationIdFromPayload(message.toolCallDetails)
    || pickCorrelationIdFromPayload(message.toolOutputDetails)
    || normalizeCorrelationId(message?.modelFacingToolCall?.id)
    || null
  );
}

function isToolCallMessage(message) {
  return TOOL_CALL_MESSAGE_TYPES.has(normalizeMessageType(message));
}

function isToolOutputMessage(message) {
  return TOOL_OUTPUT_MESSAGE_TYPES.has(normalizeMessageType(message));
}

function findMatchingPendingToolCallIndex(pendingCalls, outputCorrelationId) {
  if (!Array.isArray(pendingCalls) || pendingCalls.length === 0) {
    return -1;
  }

  if (outputCorrelationId) {
    const sameIdIndex = pendingCalls.findIndex((entry) => entry.correlationId === outputCorrelationId);
    if (sameIdIndex >= 0) {
      return sameIdIndex;
    }
    const idlessIndex = pendingCalls.findIndex((entry) => !entry.correlationId);
    if (idlessIndex >= 0) {
      return idlessIndex;
    }
    return -1;
  }

  const idlessIndex = pendingCalls.findIndex((entry) => !entry.correlationId);
  if (idlessIndex >= 0) {
    return idlessIndex;
  }
  return 0;
}

function buildReplayContextMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0) {
    return [];
  }

  const pendingToolCalls = [];
  const keepToolMessageIndexes = new Set();

  messages.forEach((message, index) => {
    if (isToolCallMessage(message)) {
      pendingToolCalls.push({
        index,
        correlationId: resolveToolMessageCorrelationId(message),
      });
      return;
    }
    if (!isToolOutputMessage(message)) {
      return;
    }
    const outputCorrelationId = resolveToolMessageCorrelationId(message);
    const pendingIndex = findMatchingPendingToolCallIndex(
      pendingToolCalls,
      outputCorrelationId,
    );
    if (pendingIndex < 0) {
      return;
    }
    const [matchedCall] = pendingToolCalls.splice(pendingIndex, 1);
    keepToolMessageIndexes.add(matchedCall.index);
    keepToolMessageIndexes.add(index);
  });

  return messages.filter((message, index) => {
    if (!isToolCallMessage(message) && !isToolOutputMessage(message)) {
      return true;
    }
    return keepToolMessageIndexes.has(index);
  });
}

async function replayTranscriptMessages(messages, userId, conversationRef) {
  if (!userId) {
    return;
  }

  await IpcBridge.invoke(INVOKE_CHANNELS.DELETE_CONVERSATION, {
    userId,
    conversationId: conversationRef,
    recordKind: 'transcript',
  });

  for (const message of messages) {
    await IpcBridge.invoke(INVOKE_CHANNELS.STORE_TRANSCRIPT, {
      content: message.text,
      userId,
      conversationRef,
      role: resolveTranscriptRole(message),
      messageType: resolveTranscriptMessageType(message),
      toolName: message.toolName || null,
      correlationId: message.correlationId || null,
      screenshot: message.screenshotRef || null,
      timestamp: message.timestamp || null,
    });
  }
}

async function runReplayQueryFlow({
  conversationRef,
  userId,
  transcriptMessages,
  rehydratePayloads,
  queryText,
  screenshotRef,
  screenshotUrl,
}) {
  await replayTranscriptMessages(transcriptMessages, userId, conversationRef);
  await ApiClient.sendRehydrateConversation(conversationRef, rehydratePayloads);
  await ApiClient.sendQuery(
    queryText,
    conversationRef,
    screenshotRef || null,
    screenshotUrl || null,
  );
}

function ensureConversationRef(sessionConversationRef) {
  let conversationRef = getActiveConversationRef() || sessionConversationRef;
  if (!conversationRef) {
    conversationRef = createConversationRef();
    setActiveConversationRef(conversationRef);
  }
  return conversationRef;
}

export function useConversationReplayActions({
  messages,
  setMessages,
  setThinkingStatus,
  setThinkingSourceEventType,
  setIsSending,
}) {
  const handleEditFromUser = useCallback(async (userMessageId, editedText) => {
    const normalizedEditedText = typeof editedText === 'string'
      ? editedText.trim()
      : '';
    if (!normalizedEditedText) {
      return;
    }

    const userIndex = messages.findIndex(
      (message) => message.id === userMessageId && message.sender === 'user',
    );
    if (userIndex < 0) {
      return;
    }

    const editUserMessage = {
      ...messages[userIndex],
      text: normalizedEditedText,
    };
    const preservedMessages = messages.slice(0, userIndex);
    const replayContextMessages = buildReplayContextMessages(preservedMessages);
    const replayConversation = [...replayContextMessages, editUserMessage];
    const preservedPayloads = replayContextMessages.map(toRehydratePayload);
    const sessionInfo = getTranscriptSessionInfo();
    const conversationRef = ensureConversationRef(sessionInfo.conversationRef);
    updateTranscriptSession(conversationRef, sessionInfo.userId || undefined);

    setMessages(replayConversation);
    setThinkingStatus(null);
    if (typeof setThinkingSourceEventType === 'function') {
      setThinkingSourceEventType(null);
    }
    setIsSending(true);

    try {
      await runReplayQueryFlow({
        conversationRef,
        userId: sessionInfo.userId,
        transcriptMessages: replayConversation,
        rehydratePayloads: preservedPayloads,
        queryText: normalizedEditedText,
        screenshotRef: editUserMessage.screenshotRef || null,
        screenshotUrl: editUserMessage.screenshotUrl || null,
      });
    } catch (error) {
      console.error('[ChatInterface] Failed to edit user message:', error);
      setIsSending(false);
    }
  }, [messages, setIsSending, setMessages, setThinkingSourceEventType, setThinkingStatus]);

  const handleTryAgainFromAssistant = useCallback(async (assistantMessageId) => {
    const assistantIndex = messages.findIndex(
      (message) => message.id === assistantMessageId && message.sender === 'assistant',
    );
    if (assistantIndex < 0) {
      return;
    }

    let userIndex = -1;
    for (let index = assistantIndex; index >= 0; index -= 1) {
      if (messages[index]?.sender === 'user') {
        userIndex = index;
        break;
      }
    }
    if (userIndex < 0) {
      return;
    }

    const retryUserMessage = messages[userIndex];
    const preservedMessages = messages.slice(0, userIndex + 1);
    const replayContextMessages = buildReplayContextMessages(preservedMessages);
    const preservedPayloads = replayContextMessages
      .slice(0, -1)
      .map(toRehydratePayload);
    const sessionInfo = getTranscriptSessionInfo();
    const conversationRef = ensureConversationRef(sessionInfo.conversationRef);
    updateTranscriptSession(conversationRef, sessionInfo.userId || undefined);

    setMessages(replayContextMessages);
    setThinkingStatus(null);
    if (typeof setThinkingSourceEventType === 'function') {
      setThinkingSourceEventType(null);
    }
    setIsSending(true);

    try {
      await runReplayQueryFlow({
        conversationRef,
        userId: sessionInfo.userId,
        transcriptMessages: replayContextMessages,
        rehydratePayloads: preservedPayloads,
        queryText: retryUserMessage.text,
        screenshotRef: retryUserMessage.screenshotRef || null,
        screenshotUrl: retryUserMessage.screenshotUrl || null,
      });
    } catch (error) {
      console.error('[ChatInterface] Failed to retry assistant message:', error);
      setIsSending(false);
    }
  }, [messages, setIsSending, setMessages, setThinkingSourceEventType, setThinkingStatus]);

  return {
    handleEditFromUser,
    handleTryAgainFromAssistant,
  };
}
