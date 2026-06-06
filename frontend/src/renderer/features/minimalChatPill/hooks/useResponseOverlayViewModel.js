import { useCallback, useEffect, useMemo, useState } from 'react';
import { useCurrentTurnPresentationState } from '../../chat/hooks/useCurrentTurnPresentationState';
import { resolveLlmOutputContract } from '../../../infrastructure/llmOutputContract';
import { toSanitizedMarkdownHtml } from '../../../infrastructure/markdown';
import { isDevUiEnabled } from '../../chat/utils/devUiFlag';
import { RESPONSE_OVERLAY_PHASE } from '../../chat/utils/overlay/responseOverlayPhaseContract';
import { OVERLAY_TURN_LIFECYCLE } from '../../chat/utils/overlay/overlayTurnLifecycleContract';
import {
  isCurrentTurnProjectionBusy,
  mapCurrentTurnProjectionPhase,
} from '../../chat/utils/state/liveTurnSurfaceState';
import {
  buildCurrentTurnMessagesFromProjection,
  isResponseCloseable,
  normalizeThinkingText,
  resolveSourceTagForResponse,
  shouldRenderResponseMarkdown,
} from '../../chat/utils/state/chatBoxResponseState';
import { resolveChatPillViewIntent } from '../../chat/utils/chatPill/chatPillSessionFlow';

function hasSdkLiveTurnPresentation(currentTurnProjection) {
  const presentation = currentTurnProjection?.presentation;
  return Boolean(
    presentation
      && typeof presentation === 'object'
      && Array.isArray(presentation.entries)
      && typeof presentation.typingVisible === 'boolean'
      && typeof presentation.overlayVisible === 'boolean',
  );
}

function resolveSdkOverlayIntent(presentation, currentTurnProjection) {
  const intent = presentation?.overlayIntent;
  if (
    intent
    && typeof intent === 'object'
    && (intent.mode === 'hidden' || intent.mode === 'awaiting' || intent.mode === 'response')
  ) {
    return intent;
  }
  const mode = presentation?.overlayVisible
    ? 'response'
    : (presentation?.typingVisible ? 'awaiting' : 'hidden');
  return {
    visible: mode !== 'hidden',
    mode,
    turnRef: currentTurnProjection?.turnRef ?? null,
    conversationRef: currentTurnProjection?.conversationRef ?? '',
    staleGuardRef: currentTurnProjection?.turnRef ?? null,
  };
}

function normalizeSdkPresentationEntries(currentTurnProjection) {
  const presentation = currentTurnProjection?.presentation;
  if (!presentation || !Array.isArray(presentation.entries)) {
    return [];
  }
  return presentation.entries
    .filter((entry) => entry && typeof entry === 'object' && typeof entry.id === 'string')
    .map((entry) => ({
      id: entry.id,
      type: entry.type || 'llm-text',
      text: typeof entry.text === 'string' ? entry.text : '',
      sourceEventType: entry.sourceEventType || null,
      sourceChannel: entry.sourceChannel || 'windie:current-turn',
      turnRef: entry.turnRef || currentTurnProjection?.turnRef || undefined,
      modelId: entry.modelId || null,
      modelProvider: entry.modelProvider || null,
      isComplete: entry.isComplete === true,
      toolName: entry.toolName || null,
    }))
    .filter((entry) => entry.text.trim().length > 0);
}

function asRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value
    : null;
}

function normalizeOptionalText(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function readToolCallExplanation(message) {
  const modelFacingToolCall = asRecord(message?.modelFacingToolCall);
  const modelArguments = asRecord(modelFacingToolCall?.arguments);
  const toolCallDetails = asRecord(message?.toolCallDetails);
  const detailArguments = asRecord(toolCallDetails?.arguments) || asRecord(toolCallDetails?.parameters);
  const directExplanation = (
    normalizeOptionalText(modelArguments?.explanation)
    || normalizeOptionalText(detailArguments?.explanation)
  );
  if (directExplanation) {
    return directExplanation;
  }
  try {
    const parsedText = JSON.parse(message?.text || '');
    const parsedArguments = asRecord(parsedText?.arguments);
    return normalizeOptionalText(parsedArguments?.explanation);
  } catch {
    return null;
  }
}

function resolveProjectedEntryText(message) {
  if (message?.type === 'tool-call' || message?.type === 'tool-explanation') {
    const explanation = readToolCallExplanation(message);
    if (explanation) {
      return explanation;
    }
  }
  return (
    typeof message.toolCallDisplayText === 'string' && message.toolCallDisplayText.trim()
      ? message.toolCallDisplayText
      : message.text
  );
}

function normalizeProjectedCurrentTurnEntries(currentTurnProjection) {
  return buildCurrentTurnMessagesFromProjection(currentTurnProjection)
    .map((message) => ({
      message,
      text: message && message.sender === 'assistant' ? resolveProjectedEntryText(message) : '',
    }))
    .filter(({ text }) => typeof text === 'string' && text.trim().length > 0)
    .map(({ message, text }) => ({
      id: message.id,
      type: message.type || 'llm-text',
      text,
      sourceEventType: message.sourceEventType || null,
      sourceChannel: message.sourceChannel || 'windie:current-turn',
      turnRef: message.turnRef || currentTurnProjection?.turnRef || undefined,
      modelId: message.modelId || null,
      modelProvider: message.modelProvider || null,
      isComplete: message.isComplete === true,
      toolName: message.toolName || null,
    }));
}

function resolveSdkOverlayLifecycle(presentation, overlayIntent) {
  if (!presentation) {
    return OVERLAY_TURN_LIFECYCLE.IDLE;
  }
  if (overlayIntent?.mode === 'awaiting') {
    return OVERLAY_TURN_LIFECYCLE.AWAITING;
  }
  if (overlayIntent?.mode === 'response' && presentation.isBusy) {
    return OVERLAY_TURN_LIFECYCLE.ACTIVE;
  }
  if (presentation.isTerminal) {
    return OVERLAY_TURN_LIFECYCLE.TERMINAL;
  }
  return OVERLAY_TURN_LIFECYCLE.IDLE;
}

function buildSdkCurrentTurnPresentationState({
  currentTurnProjection,
  responseOverlayEntries,
  closedResponseId,
}) {
  const presentation = currentTurnProjection?.presentation;
  const latestEntry = responseOverlayEntries.length > 0
    ? responseOverlayEntries[responseOverlayEntries.length - 1]
    : null;
  const visibleResponse = (
    latestEntry && latestEntry.id !== closedResponseId
      ? latestEntry
      : null
  );
  const overlayIntent = resolveSdkOverlayIntent(presentation, currentTurnProjection);
  const awaitingVisible = overlayIntent.mode === 'awaiting';
  const responseVisible = overlayIntent.mode === 'response';
  const overlayTurnLifecycle = resolveSdkOverlayLifecycle(presentation, overlayIntent);
  return {
    activeResponse: visibleResponse,
    hasVisibleReply: presentation?.hasVisibleContent === true,
    loopUiState: responseVisible ? 'active-response' : (awaitingVisible ? 'awaiting-reply' : 'idle'),
    isBusy: presentation?.isBusy === true,
    isAwaitingReply: awaitingVisible,
    showAssistantAwaitingDot: awaitingVisible,
    awaitingDotTargetMessageId: null,
    visibleResponse,
    chatboxSurfaceState: responseVisible ? 'response' : (awaitingVisible ? 'awaiting-reply' : 'compact'),
    showChatboxAwaitingReply: awaitingVisible,
    showChatboxResponse: responseVisible,
    isTransportConnected: true,
    overlayTurnLifecycle,
    overlayIntent,
  };
}

export function useResponseOverlayViewModel({
  messages = [],
  isSending = false,
  thinkingStatus,
  currentTurnProjection = null,
}) {
  const [closedResponseId, setClosedResponseId] = useState(null);
  const useSdkLiveTurnPresentation = hasSdkLiveTurnPresentation(currentTurnProjection);

  const projectedPhase = mapCurrentTurnProjectionPhase(currentTurnProjection?.phase)
    || RESPONSE_OVERLAY_PHASE.IDLE;
  const useLocalSendLatch = (
    !useSdkLiveTurnPresentation
    && isSending === true
    && (
      !currentTurnProjection
      || currentTurnProjection.phase === 'complete'
      || currentTurnProjection.phase === 'error'
      || currentTurnProjection.phase === 'idle'
    )
  );
  const currentTurnMessages = useMemo(
    () => (
      useSdkLiveTurnPresentation
        ? []
        : useLocalSendLatch
        ? messages
        : buildCurrentTurnMessagesFromProjection(currentTurnProjection)
    ),
    [currentTurnProjection, messages, useLocalSendLatch, useSdkLiveTurnPresentation],
  );
  const currentTurnPhase = useLocalSendLatch
    ? RESPONSE_OVERLAY_PHASE.AWAITING_FIRST_CHUNK
    : projectedPhase;
  const currentTurnIsSending = useLocalSendLatch
    ? true
    : isCurrentTurnProjectionBusy(currentTurnProjection?.phase);

  const currentTurnPresentationState = useCurrentTurnPresentationState({
    phase: currentTurnPhase,
    isSending: currentTurnIsSending,
    messages: currentTurnMessages,
    dismissedResponseId: closedResponseId,
  });

  const responseOverlayEntries = useMemo(
    () => {
      if (useLocalSendLatch) {
        return [];
      }
      if (useSdkLiveTurnPresentation) {
        return normalizeSdkPresentationEntries(currentTurnProjection);
      }
      return normalizeProjectedCurrentTurnEntries(currentTurnProjection);
    },
    [currentTurnProjection, useLocalSendLatch, useSdkLiveTurnPresentation],
  );

  const resolvedCurrentTurnPresentationState = useMemo(
    () => (
      useSdkLiveTurnPresentation
        ? buildSdkCurrentTurnPresentationState({
          currentTurnProjection,
          responseOverlayEntries,
          closedResponseId,
        })
        : currentTurnPresentationState
    ),
    [
      closedResponseId,
      currentTurnPresentationState,
      currentTurnProjection,
      responseOverlayEntries,
      useSdkLiveTurnPresentation,
    ],
  );

  const viewIntent = useMemo(() => resolveChatPillViewIntent({
    messages: currentTurnMessages,
    currentTurnPresentationState: resolvedCurrentTurnPresentationState,
    responseOverlayEntries,
    dismissedResponseId: closedResponseId,
  }), [
    closedResponseId,
    currentTurnMessages,
    responseOverlayEntries,
    resolvedCurrentTurnPresentationState,
  ]);

  const latestSourceTaggedResponseEntry = useMemo(() => {
    for (let index = responseOverlayEntries.length - 1; index >= 0; index -= 1) {
      const entry = responseOverlayEntries[index];
      if (entry?.type === 'llm-text' || entry?.type === 'error') {
        return entry;
      }
      if (typeof entry?.sourceEventType === 'string' && entry.sourceEventType.trim()) {
        return entry;
      }
    }
    return null;
  }, [responseOverlayEntries]);

  const responseEntrySignature = useMemo(
    () => responseOverlayEntries.map((entry) => `${entry.id}:${entry.text}`).join('\u0001'),
    [responseOverlayEntries],
  );

  const responseIsCloseable = useMemo(() => {
    if (!viewIntent.showResponse) {
      return false;
    }
    if (resolvedCurrentTurnPresentationState.isBusy) {
      return false;
    }
    return isResponseCloseable(latestSourceTaggedResponseEntry)
      || responseOverlayEntries.some((entry) => (
        entry.type === 'tool-explanation'
        || entry.type === 'tool-call'
        || entry.type === 'tool-progress'
        || entry.type === 'tool-output'
      ));
  }, [
    resolvedCurrentTurnPresentationState.isBusy,
    latestSourceTaggedResponseEntry,
    responseOverlayEntries,
    viewIntent.showResponse,
  ]);

  const renderedResponseEntries = useMemo(() => {
    return responseOverlayEntries.map((entry) => {
      if (!shouldRenderResponseMarkdown(entry)) {
        return {
          ...entry,
          markdownHtml: '',
        };
      }
      const contract = resolveLlmOutputContract(entry.text ?? '', {
        provider: entry.modelProvider || null,
        modelId: entry.modelId || null,
        enableMath: true,
        stripAccidentalHtmlTokens: true,
      });
      return {
        ...entry,
        markdownHtml: toSanitizedMarkdownHtml(contract.markdown, { enableMath: contract.mathEnabled }),
      };
    });
  }, [responseOverlayEntries]);

  const thinkingText = useMemo(
    () => normalizeThinkingText(
      currentTurnProjection?.reasoningText ?? thinkingStatus,
    ),
    [currentTurnProjection?.reasoningText, thinkingStatus],
  );

  const sourceTagForResponse = useMemo(() => {
    return resolveSourceTagForResponse({
      visibleResponse: latestSourceTaggedResponseEntry,
      showResponse: viewIntent.showResponse,
      devUiEnabled: isDevUiEnabled(),
    });
  }, [latestSourceTaggedResponseEntry, viewIntent.showResponse]);

  useEffect(() => {
    if (currentTurnPhase === RESPONSE_OVERLAY_PHASE.AWAITING_FIRST_CHUNK) {
      setClosedResponseId(null);
    }
  }, [currentTurnPhase, currentTurnProjection?.turnRef]);

  const handleCloseResponse = useCallback(() => {
    if (!viewIntent.latestResponseOverlayEntryId || !responseIsCloseable) {
      return;
    }
    setClosedResponseId(viewIntent.latestResponseOverlayEntryId);
  }, [responseIsCloseable, viewIntent.latestResponseOverlayEntryId]);

  return {
    currentTurnPresentationState: resolvedCurrentTurnPresentationState,
    overlayIntent: resolvedCurrentTurnPresentationState.overlayIntent ?? null,
    responseOverlayEntries,
    latestSourceTaggedResponseEntry,
    responseEntrySignature,
    responseIsCloseable,
    renderedResponseEntries,
    thinkingText,
    sourceTagForResponse,
    handleCloseResponse,
    ...viewIntent,
  };
}
