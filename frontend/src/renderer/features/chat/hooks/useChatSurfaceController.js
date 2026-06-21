/**
 * Provides the use chat surface controller module for the renderer UI.
 */

import { useCallback } from 'react';
import { DesktopRendererConfigRuntimeClient } from '../../../app/runtime/desktopRendererConfigRuntimeClient';
import { DesktopManualCompactionRuntime } from '../../../app/runtime/desktopManualCompactionRuntime';
import { useCurrentTurnPresentationState } from './useCurrentTurnPresentationState';
import {
  DesktopLiveTurnSurfaceRuntime,
} from '../../../app/runtime/desktopLiveTurnSurfaceRuntime';
import { DesktopCurrentTurnPresentationRuntime } from '../../../app/runtime/desktopCurrentTurnPresentationRuntime';
import { DesktopVisibleTurnLifecycleRuntime } from '../../../app/runtime/desktopVisibleTurnLifecycleRuntime';

const {
  resolveSdkCurrentTurnPresentationState,
} = DesktopCurrentTurnPresentationRuntime;
const {
  resolveVisibleTurnLifecycle,
} = DesktopVisibleTurnLifecycleRuntime;
const {
  resolveLiveTurnPresentationInput,
} = DesktopLiveTurnSurfaceRuntime;
const {
  runManualCompaction: runManualCompactionCommand,
} = DesktopManualCompactionRuntime;

function applyBooleanConfigUpdate(updateConfig, key, nextValue) {
  if (typeof updateConfig !== 'function') {
    return false;
  }
  updateConfig({
    [key]: nextValue,
  });
  return true;
}

function findLatestUserMessageAnchor(messages) {
  if (!Array.isArray(messages)) {
    return null;
  }
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.sender === 'user' && typeof message.id === 'string' && message.id.trim()) {
      return {
        kind: 'user-message',
        rowId: message.id.trim(),
      };
    }
  }
  return null;
}

function resolveControllerVisibleTurnLifecycle(visibleTurnLifecycle, liveTurnPresentationInput, messages) {
  if (
    liveTurnPresentationInput.useLocalSendLatch === true
    && visibleTurnLifecycle.status !== 'local_pending'
  ) {
    // Compatibility until every send path creates pendingTurn before toggling isSending.
    return {
      ...visibleTurnLifecycle,
      status: 'local_pending',
      source: 'local',
      conversationRef: liveTurnPresentationInput.conversationRef || visibleTurnLifecycle.conversationRef,
      turnRef: liveTurnPresentationInput.turnRef || visibleTurnLifecycle.turnRef,
      awaitingAnchor: findLatestUserMessageAnchor(messages),
      entries: [],
      terminalReason: null,
      isBusy: true,
      showTyping: true,
    };
  }
  return visibleTurnLifecycle;
}

function applyVisibleLifecycleToPresentationState(presentationState, visibleTurnLifecycle) {
  const nextState = {
    ...presentationState,
    visibleTurnLifecycle,
    isBusy: visibleTurnLifecycle.isBusy === true,
  };
  if (
    visibleTurnLifecycle.status === 'local_pending'
    || visibleTurnLifecycle.status === 'awaiting'
  ) {
    return {
      ...nextState,
      loopUiState: 'awaiting-reply',
      isAwaitingReply: true,
      showAssistantAwaitingDot: true,
      awaitingDotTargetMessageId: visibleTurnLifecycle.awaitingAnchor?.rowId || null,
      chatboxSurfaceState: 'awaiting-reply',
      showChatboxAwaitingReply: true,
      showChatboxResponse: false,
    };
  }
  if (visibleTurnLifecycle.status === 'active') {
    return {
      ...nextState,
      isAwaitingReply: false,
      showAssistantAwaitingDot: false,
      awaitingDotTargetMessageId: null,
      showChatboxAwaitingReply: false,
    };
  }
  return {
    ...nextState,
    isAwaitingReply: false,
    showAssistantAwaitingDot: false,
    awaitingDotTargetMessageId: null,
    showChatboxAwaitingReply: false,
  };
}

export function useChatSurfaceController({
  isSending,
  messages,
  currentTurnProjection = null,
  pendingTurn = null,
  sessionInfo,
  setThinkingStatus,
  setThinkingSourceEventType,
  allowManualCompactionWhileBusy = false,
  warningContext = 'ChatSurface',
}) {
  const { config, updateConfig } = DesktopRendererConfigRuntimeClient.useDesktopRendererConfigContext();
  const visibleTurnLifecycle = resolveVisibleTurnLifecycle({
    activeConversationRef: sessionInfo?.conversationRef || null,
    pendingTurn,
    currentTurnProjection,
    messages,
  });
  const liveTurnPresentationInput = resolveLiveTurnPresentationInput({
    currentTurnProjection,
    pendingTurn,
    isSending,
    messages,
  });
  const controllerVisibleTurnLifecycle = resolveControllerVisibleTurnLifecycle(
    visibleTurnLifecycle,
    liveTurnPresentationInput,
    messages,
  );
  const currentTurnPresentationState = useCurrentTurnPresentationState({
    phase: liveTurnPresentationInput.phase,
    isSending: liveTurnPresentationInput.isSending,
    messages,
  });
  const resolvedCurrentTurnPresentationState = (
    liveTurnPresentationInput.useSdkLiveTurnPresentation
    && !liveTurnPresentationInput.useLocalSendLatch
  )
    ? resolveSdkCurrentTurnPresentationState({
      currentTurnProjection,
      fallbackState: currentTurnPresentationState,
    })
    : currentTurnPresentationState;
  const visibleLifecyclePresentationState = applyVisibleLifecycleToPresentationState(
    resolvedCurrentTurnPresentationState,
    controllerVisibleTurnLifecycle,
  );
  const isBusy = controllerVisibleTurnLifecycle.isBusy === true;
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
    currentTurnPresentationState: visibleLifecyclePresentationState,
    includeQueryScreenshot,
    isBusy,
    canStop: isBusy,
    liveTurnPhase: liveTurnPresentationInput.phase,
    liveTurnSource: liveTurnPresentationInput.source,
    visibleTurnLifecycle: controllerVisibleTurnLifecycle,
    speechModeEnabled,
    toggleBooleanConfig,
    toggleQueryScreenshot,
    toggleSpeechMode,
    wakewordSttEnabled,
    runManualCompaction,
  };
}
