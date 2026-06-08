import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useCurrentTurnPresentationState } from '../../chat/hooks/useCurrentTurnPresentationState';
import { resolveLlmOutputContract } from '../../../infrastructure/llmOutputContract';
import { toSanitizedMarkdownHtml } from '../../../infrastructure/markdown';
import { IpcBridge, INVOKE_CHANNELS } from '../../../infrastructure/ipc/bridge';
import {
  buildResponseOverlayDismissalKey,
  useChatStore,
} from '../../chat/stores/chatStore';
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
import { logRendererLiveSurfaceTrace } from '../../chat/utils/chatStream/chatStreamDebugTrace';

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
  dismissedResponseId,
}) {
  const presentation = currentTurnProjection?.presentation;
  const latestEntry = responseOverlayEntries.length > 0
    ? responseOverlayEntries[responseOverlayEntries.length - 1]
    : null;
  const visibleResponse = (
    latestEntry && latestEntry.id !== dismissedResponseId
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
  const dismissedResponseOverlayEntries = useChatStore(
    (state) => state.dismissedResponseOverlayEntries,
  );
  const dismissResponseOverlayEntry = useChatStore(
    (state) => state.dismissResponseOverlayEntry,
  );
  const lastResolvedTraceSignatureRef = useRef(null);
  const lastTypingVisibleRef = useRef(null);
  const lastOverlayIntentModeRef = useRef(null);
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

  const responseOverlayDismissalTarget = useMemo(() => {
    if (responseOverlayEntries.length === 0) {
      return null;
    }
    const latestEntry = responseOverlayEntries[responseOverlayEntries.length - 1];
    if (!latestEntry?.id) {
      return null;
    }
    const sdkOverlayIntent = useSdkLiveTurnPresentation
      ? resolveSdkOverlayIntent(currentTurnProjection?.presentation, currentTurnProjection)
      : null;
    const turnRef = (
      sdkOverlayIntent?.turnRef
      || latestEntry.turnRef
      || currentTurnProjection?.turnRef
      || null
    );
    const conversationRef = (
      sdkOverlayIntent?.conversationRef
      || currentTurnProjection?.conversationRef
      || null
    );
    const guardRef = (
      sdkOverlayIntent?.staleGuardRef
      || sdkOverlayIntent?.turnRef
      || turnRef
      || null
    );
    return {
      conversationRef,
      turnRef,
      guardRef,
      responseEntryId: latestEntry.id,
    };
  }, [
    currentTurnProjection,
    responseOverlayEntries,
    useSdkLiveTurnPresentation,
  ]);

  const dismissedResponseId = useMemo(() => {
    const dismissalKey = buildResponseOverlayDismissalKey(responseOverlayDismissalTarget || {});
    if (!dismissalKey || !dismissedResponseOverlayEntries[dismissalKey]) {
      return null;
    }
    return responseOverlayDismissalTarget.responseEntryId;
  }, [
    dismissedResponseOverlayEntries,
    responseOverlayDismissalTarget,
  ]);

  const currentTurnPresentationState = useCurrentTurnPresentationState({
    phase: currentTurnPhase,
    isSending: currentTurnIsSending,
    messages: currentTurnMessages,
    dismissedResponseId,
  });

  const resolvedCurrentTurnPresentationState = useMemo(
    () => (
      useSdkLiveTurnPresentation
        ? buildSdkCurrentTurnPresentationState({
          currentTurnProjection,
          responseOverlayEntries,
          dismissedResponseId,
        })
        : currentTurnPresentationState
    ),
    [
      currentTurnPresentationState,
      currentTurnProjection,
      dismissedResponseId,
      responseOverlayEntries,
      useSdkLiveTurnPresentation,
    ],
  );

  const viewIntent = useMemo(() => resolveChatPillViewIntent({
    messages: currentTurnMessages,
    currentTurnPresentationState: resolvedCurrentTurnPresentationState,
    responseOverlayEntries,
    dismissedResponseId,
  }), [
    currentTurnMessages,
    dismissedResponseId,
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
    const overlayIntent = resolvedCurrentTurnPresentationState.overlayIntent ?? null;
    const awaitingVisible = viewIntent.showAwaitingReply === true;
    const responseVisible = viewIntent.showResponse === true;
    const tracePayload = {
      source: 'renderer-overlay-view-model',
      turnRef: currentTurnProjection?.turnRef || null,
      conversationRef: currentTurnProjection?.conversationRef || overlayIntent?.conversationRef || null,
      phase: currentTurnProjection?.phase || currentTurnPhase,
      overlayMode: overlayIntent?.mode || null,
      guardRef: overlayIntent?.staleGuardRef || overlayIntent?.turnRef || currentTurnProjection?.turnRef || null,
      awaitingVisible,
      responseVisible,
      showAwaitingDot: resolvedCurrentTurnPresentationState.showAssistantAwaitingDot === true,
      hasVisibleReply: resolvedCurrentTurnPresentationState.hasVisibleReply === true,
      isBusy: resolvedCurrentTurnPresentationState.isBusy === true,
      overlayTurnLifecycle: resolvedCurrentTurnPresentationState.overlayTurnLifecycle || null,
      entryCount: responseOverlayEntries.length,
      visibleResponseId: viewIntent.visibleResponse?.id || null,
      latestEntryId: viewIntent.latestResponseOverlayEntryId || null,
      useSdkLiveTurnPresentation,
      useLocalSendLatch,
    };
    const signature = JSON.stringify(tracePayload);
    if (lastResolvedTraceSignatureRef.current !== signature) {
      lastResolvedTraceSignatureRef.current = signature;
      logRendererLiveSurfaceTrace(
        'renderer.overlay_view_model.resolved',
        tracePayload,
        tracePayload.conversationRef,
      );
    }
    if (lastTypingVisibleRef.current !== awaitingVisible) {
      lastTypingVisibleRef.current = awaitingVisible;
      logRendererLiveSurfaceTrace(
        awaitingVisible ? 'typing.show' : 'typing.hide',
        {
          ...tracePayload,
          reason: awaitingVisible
            ? (useSdkLiveTurnPresentation ? 'sdk-awaiting' : 'preflight-awaiting')
            : (responseVisible ? 'response-visible' : 'not-awaiting'),
        },
        tracePayload.conversationRef,
      );
    }
    const nextOverlayIntentMode = awaitingVisible
      ? 'awaiting'
      : (responseVisible ? 'response' : 'hidden');
    if (lastOverlayIntentModeRef.current !== nextOverlayIntentMode) {
      lastOverlayIntentModeRef.current = nextOverlayIntentMode;
      const nextOverlayIntentEvent = nextOverlayIntentMode === 'awaiting'
        ? 'response_overlay.intent.show_awaiting'
        : (nextOverlayIntentMode === 'response'
          ? 'response_overlay.intent.show_response'
          : 'response_overlay.intent.hide');
      logRendererLiveSurfaceTrace(
        nextOverlayIntentEvent,
        {
          ...tracePayload,
          reason: nextOverlayIntentMode === 'awaiting'
            ? 'renderer-view-model-awaiting'
            : (nextOverlayIntentMode === 'response'
              ? 'renderer-view-model-response'
              : 'renderer-view-model-hidden'),
        },
        tracePayload.conversationRef,
      );
    }
  }, [
    currentTurnPhase,
    currentTurnProjection?.conversationRef,
    currentTurnProjection?.phase,
    currentTurnProjection?.turnRef,
    responseOverlayEntries.length,
    resolvedCurrentTurnPresentationState,
    useLocalSendLatch,
    useSdkLiveTurnPresentation,
    viewIntent,
  ]);

  const handleCloseResponse = useCallback(() => {
    if (
      !viewIntent.latestResponseOverlayEntryId
      || !responseIsCloseable
      || !responseOverlayDismissalTarget
    ) {
      return;
    }
    const dismissalTarget = {
      ...responseOverlayDismissalTarget,
      responseEntryId: viewIntent.latestResponseOverlayEntryId,
    };
    dismissResponseOverlayEntry(dismissalTarget);
    IpcBridge.invoke(INVOKE_CHANNELS.SET_RESPONSEBOX_SIZE, {
      visible: false,
      width: 0,
      height: 0,
      turn_ref: dismissalTarget.turnRef,
      stale_guard_ref: dismissalTarget.guardRef || dismissalTarget.turnRef,
      dismissed: true,
    }).catch((error) => {
      console.warn('[MinimalResponseOverlay] Failed to dismiss response overlay:', error);
    });
  }, [
    dismissResponseOverlayEntry,
    responseIsCloseable,
    responseOverlayDismissalTarget,
    viewIntent.latestResponseOverlayEntryId,
  ]);

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
