import { useCallback } from 'react';
import { useAppConfigContext } from '../../../app/providers/AppConfigContext';
import { runManualCompaction as runManualCompactionCommand } from '../utils/session/manualCompactionRuntime';
import { useCurrentTurnPresentationState } from './useCurrentTurnPresentationState';
import { resolveLiveTurnPresentationInput } from '../utils/state/liveTurnSurfaceState';

function hasSdkLiveTurnPresentation(currentTurnProjection) {
  const presentation = currentTurnProjection?.presentation;
  return Boolean(
    presentation
      && typeof presentation === 'object'
      && typeof presentation.typingVisible === 'boolean'
      && typeof presentation.overlayVisible === 'boolean',
  );
}

function buildSdkCurrentTurnPresentationState(currentTurnProjection) {
  const presentation = currentTurnProjection?.presentation;
  if (!presentation) {
    return null;
  }
  return {
    activeResponse: null,
    hasVisibleReply: presentation.hasVisibleContent === true,
    loopUiState: presentation.overlayVisible ? 'active-response' : (presentation.typingVisible ? 'awaiting-reply' : 'idle'),
    isBusy: presentation.isBusy === true,
    isAwaitingReply: presentation.typingVisible === true,
    showAssistantAwaitingDot: presentation.typingVisible === true,
    awaitingDotTargetMessageId: null,
    visibleResponse: null,
    chatboxSurfaceState: presentation.overlayVisible ? 'response' : (presentation.typingVisible ? 'awaiting-reply' : 'compact'),
    showChatboxAwaitingReply: presentation.typingVisible === true,
    showChatboxResponse: presentation.overlayVisible === true,
    isTransportConnected: true,
    overlayTurnLifecycle: presentation.typingVisible
      ? 'awaiting'
      : (presentation.overlayVisible && presentation.isBusy ? 'active' : (presentation.isTerminal ? 'terminal' : 'idle')),
  };
}

function applyBooleanConfigUpdate(updateConfig, key, nextValue) {
  if (typeof updateConfig !== 'function') {
    return false;
  }
  updateConfig({
    [key]: nextValue,
  });
  return true;
}

export function useChatSurfaceController({
  isSending,
  messages,
  currentTurnProjection = null,
  allowedTypes,
  sessionInfo,
  setThinkingStatus,
  setThinkingSourceEventType,
  allowManualCompactionWhileBusy = false,
  warningContext = 'ChatSurface',
}) {
  const { config, updateConfig } = useAppConfigContext();
  const liveTurnPresentationInput = resolveLiveTurnPresentationInput({
    currentTurnProjection,
    isSending,
    messages,
  });
  const currentTurnPresentationState = useCurrentTurnPresentationState({
    phase: liveTurnPresentationInput.phase,
    isSending: liveTurnPresentationInput.isSending,
    messages,
    allowedTypes,
  });
  const resolvedCurrentTurnPresentationState = hasSdkLiveTurnPresentation(currentTurnProjection)
    ? buildSdkCurrentTurnPresentationState(currentTurnProjection)
    : currentTurnPresentationState;
  const isBusy = resolvedCurrentTurnPresentationState.isBusy === true;
  const speechModeEnabled = config?.speech_mode_enabled === true;
  const wakewordSttEnabled = config?.wakeword_stt_enabled === true;
  const includeQueryScreenshot = config?.include_query_screenshot ?? true;

  const toggleBooleanConfig = useCallback((key, nextValue) => {
    if (isBusy) {
      return false;
    }
    return applyBooleanConfigUpdate(updateConfig, key, nextValue);
  }, [isBusy, updateConfig]);

  const toggleSpeechMode = useCallback(() => {
    return toggleBooleanConfig('speech_mode_enabled', !speechModeEnabled);
  }, [speechModeEnabled, toggleBooleanConfig]);

  const toggleQueryScreenshot = useCallback(() => {
    return toggleBooleanConfig('include_query_screenshot', !includeQueryScreenshot);
  }, [includeQueryScreenshot, toggleBooleanConfig]);

  const runManualCompaction = useCallback(async () => {
    if (isBusy && !allowManualCompactionWhileBusy) {
      return false;
    }
    await runManualCompactionCommand({
      config,
      conversationRef: sessionInfo?.conversationRef || null,
      userId: sessionInfo?.userId || null,
      setThinkingStatus,
      setThinkingSourceEventType,
      warningContext,
    });
    return true;
  }, [
    allowManualCompactionWhileBusy,
    config,
    isBusy,
    sessionInfo?.conversationRef,
    sessionInfo?.userId,
    setThinkingSourceEventType,
    setThinkingStatus,
    warningContext,
  ]);

  return {
    config,
    currentTurnPresentationState: resolvedCurrentTurnPresentationState,
    includeQueryScreenshot,
    isBusy,
    canStop: isBusy,
    liveTurnPhase: liveTurnPresentationInput.phase,
    liveTurnSource: liveTurnPresentationInput.source,
    speechModeEnabled,
    toggleBooleanConfig,
    toggleQueryScreenshot,
    toggleSpeechMode,
    wakewordSttEnabled,
    runManualCompaction,
  };
}
