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

function resolveSdkOverlayLifecycle(presentation) {
  if (!presentation) {
    return OVERLAY_TURN_LIFECYCLE.IDLE;
  }
  if (presentation.typingVisible) {
    return OVERLAY_TURN_LIFECYCLE.AWAITING;
  }
  if (presentation.overlayVisible && presentation.isBusy) {
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
  const overlayTurnLifecycle = resolveSdkOverlayLifecycle(presentation);
  return {
    activeResponse: visibleResponse,
    hasVisibleReply: presentation?.hasVisibleContent === true,
    loopUiState: presentation?.overlayVisible ? 'active-response' : (presentation?.typingVisible ? 'awaiting-reply' : 'idle'),
    isBusy: presentation?.isBusy === true,
    isAwaitingReply: presentation?.typingVisible === true,
    showAssistantAwaitingDot: presentation?.typingVisible === true,
    awaitingDotTargetMessageId: null,
    visibleResponse,
    chatboxSurfaceState: presentation?.overlayVisible ? 'response' : (presentation?.typingVisible ? 'awaiting-reply' : 'compact'),
    showChatboxAwaitingReply: presentation?.typingVisible === true,
    showChatboxResponse: presentation?.overlayVisible === true,
    isTransportConnected: true,
    overlayTurnLifecycle,
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
    isSending === true
    && (
      !currentTurnProjection
      || currentTurnProjection.phase === 'complete'
      || currentTurnProjection.phase === 'error'
      || currentTurnProjection.phase === 'idle'
    )
  );
  const currentTurnMessages = useMemo(
    () => (useLocalSendLatch ? messages : []),
    [messages, useLocalSendLatch],
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
    () => (
      useSdkLiveTurnPresentation
        ? normalizeSdkPresentationEntries(currentTurnProjection)
        : []
    ),
    [currentTurnProjection, useSdkLiveTurnPresentation],
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
