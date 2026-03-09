import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import MessageList from './MessageList';
import MessageInput from './MessageInput';
import ChatInterfaceHeaderControls from './ChatInterfaceHeaderControls';
import { useChatStore } from '../stores/chatStore';
import { useChatMessageSender } from '../hooks/useChatMessageSender';
import {
  useChatInterfaceAudioChunkStream,
  useChatInterfaceMenuDismiss,
  useChatInterfaceNewChatEvent,
  useChatInterfaceStopShortcut,
} from '../hooks/useChatInterfaceBindings';
import { useAppConfigContext } from '../../../app/providers/AppContextHooks';
import { ApiClient } from '../../../infrastructure/api/client';
import { PlayerService } from '../../../infrastructure/audio/PlayerService';
import { selectChatInterfaceState } from '../utils/chatSelectors';
import { startNewChatSession } from '../utils/session/newChatSession';
import { loadConversationTranscriptMemories } from '../../../infrastructure/transcript/conversationTranscriptLoader';
import {
  getActiveConversationRef,
  getTranscriptSessionInfo,
} from '../../../infrastructure/transcript/TranscriptWriter';
import { toRehydrateMessagePayload } from '../../dashboard/utils/episodicMemoryUtils';
import {
  COMPACTION_THINKING_STATUS,
} from '../utils/chatStream/chatStreamThinkingStatus';
import {
  buildChatModelOptions,
  buildChatProviderOptions,
  formatProviderLabel,
  getAvailableModelPool,
  resolveModelIdForReasoningMode,
  resolveProviderModels,
  resolveSelectedReasoningMode,
  resolveSelectedModelOption,
} from '../utils/chatModelOptions';
import { useConversationReplayActions } from '../hooks/useConversationReplayActions';
import { isDevUiEnabled } from '../utils/devUiFlag';
import { applyStopQueryUiState } from '../utils/state/stopQueryState';
import { useCurrentTurnPresentationState } from '../hooks/useCurrentTurnPresentationState';
import { useTranscriptSessionInfo } from '../../dashboard/hooks/useTranscriptSessionInfo';
import { isVmModeEnabled } from '../../../infrastructure/runtime/vmMode';
import { useMainWindowControls } from '../../../hooks/useMainWindowControls';
import {
  VISIBLE_ASSISTANT_REPLY_TYPE_SET,
} from '../utils/state/chatTurnPresentationState';
import '../../../styles/ChatInterface.css';

function waitForNextPaint() {
  return new Promise((resolve) => {
    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(() => resolve());
      return;
    }
    setTimeout(resolve, 0);
  });
}

function ChatInterface({ focusComposerToken = 0 }) {
  const vmModeEnabled = isVmModeEnabled();

  const {
    messages,
    isSending,
    thinkingStatus,
    thinkingSourceEventType,
    compactionDebugInfo,
    streamPhase,
  } = useChatStore(
    useShallow(selectChatInterfaceState),
  );
  const clearMessages = useChatStore((state) => state.clearMessages);
  const setMessages = useChatStore((state) => state.setMessages);
  const updateMessage = useChatStore((state) => state.updateMessage);
  const setIsSending = useChatStore((state) => state.setIsSending);
  const setThinkingStatus = useChatStore((state) => state.setThinkingStatus);
  const setThinkingSourceEventType = useChatStore((state) => state.setThinkingSourceEventType);
  const setTokenCounts = useChatStore((state) => state.setTokenCounts);
  const updateStreamTracking = useChatStore((state) => state.updateStreamTracking);
  const { config, updateConfig, availableModels } = useAppConfigContext();
  const transcriptSessionInfo = useTranscriptSessionInfo();

  const audioPlayerRef = useRef(null);

  useEffect(() => {
    audioPlayerRef.current = new PlayerService();
    return () => {
      audioPlayerRef.current?.cleanup();
    };
  }, []);

  useChatInterfaceAudioChunkStream(audioPlayerRef);

  const voiceModeEnabled = config?.voice_mode_enabled === true;
  const speechModeEnabled = config?.speech_mode_enabled === true;
  const {
    isBusy: composerBusy,
    isTransportConnected,
    awaitingDotTargetMessageId,
  } = useCurrentTurnPresentationState({
    phase: streamPhase,
    isSending,
    messages,
    allowedTypes: VISIBLE_ASSISTANT_REPLY_TYPE_SET,
  });
  const canStop = composerBusy;
  const modelMode = config?.model_mode || 'online';
  const configuredProvider = config?.model_provider || '';
  const configuredModelId = config?.selected_model_id || '';
  const availableModelPool = useMemo(
    () => getAvailableModelPool(availableModels, modelMode),
    [availableModels, modelMode],
  );
  const modelOptions = useMemo(() => buildChatModelOptions({
    availableModelPool,
    configuredModelId,
    configuredProvider,
  }), [availableModelPool, configuredModelId, configuredProvider]);
  const providerOptions = useMemo(() => buildChatProviderOptions({
    availableModelPool,
    configuredProvider,
  }), [availableModelPool, configuredProvider]);
  const providerLabel = formatProviderLabel(
    configuredProvider || providerOptions[0] || 'No providers available',
  );
  const selectedModelOption = resolveSelectedModelOption(modelOptions, configuredModelId);
  const modelLabelBase = selectedModelOption?.label || configuredModelId || 'No models available';
  const reasoningModeOptions = Array.isArray(selectedModelOption?.reasoningModeOptions)
    ? selectedModelOption.reasoningModeOptions
    : [];
  const selectedReasoningMode = resolveSelectedReasoningMode(selectedModelOption, configuredModelId);
  const selectedReasoningModeLabel = (
    reasoningModeOptions.find((modeOption) => modeOption.mode === selectedReasoningMode)?.label
    || ''
  );
  const showReasoningModeSelector = reasoningModeOptions.length > 1;
  const devUiEnabled = isDevUiEnabled();
  const [providerMenuOpen, setProviderMenuOpen] = useState(false);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [reasoningModeMenuOpen, setReasoningModeMenuOpen] = useState(false);
  const providerMenuRef = useRef(null);
  const modelMenuRef = useRef(null);
  const reasoningModeMenuRef = useRef(null);
  const {
    handleWindowMinimize,
    handleWindowToggleMaximize,
    handleWindowClose,
  } = useMainWindowControls({ warningPrefix: 'ChatInterface' });

  useChatInterfaceMenuDismiss({
    providerMenuRef,
    modelMenuRef,
    reasoningModeMenuRef,
    setProviderMenuOpen,
    setModelMenuOpen,
    setReasoningModeMenuOpen,
  });

  const stopPlayback = useCallback(() => {
    audioPlayerRef.current?.stopPlayback();
  }, []);

  const handleStopQuery = useCallback(() => {
    if (!composerBusy) {
      return;
    }
    applyStopQueryUiState({
      setIsSending,
      setThinkingStatus,
      setThinkingSourceEventType,
      updateStreamTracking,
    });
    stopPlayback();
    ApiClient.stopQuery(transcriptSessionInfo.conversationRef || getActiveConversationRef() || null);
  }, [
    composerBusy,
    setIsSending,
    setThinkingSourceEventType,
    setThinkingStatus,
    stopPlayback,
    transcriptSessionInfo.conversationRef,
    updateStreamTracking,
  ]);

  useChatInterfaceStopShortcut(canStop, handleStopQuery);

  const handleNewChat = useCallback(() => {
    startNewChatSession({
      clearMessages,
      setIsSending,
      setThinkingStatus,
      setTokenCounts,
      stopActiveQuery: composerBusy
        ? () => {
          stopPlayback();
          ApiClient.stopQuery(transcriptSessionInfo.conversationRef || getActiveConversationRef() || null);
        }
        : undefined,
    });
  }, [
    composerBusy,
    clearMessages,
    setIsSending,
    setThinkingStatus,
    setTokenCounts,
    stopPlayback,
    transcriptSessionInfo.conversationRef,
  ]);

  const handleToggleSpeechMode = useCallback(() => {
    if (typeof updateConfig !== 'function') {
      return;
    }
    updateConfig({
      speech_mode_enabled: !speechModeEnabled,
    });
  }, [speechModeEnabled, updateConfig]);

  const handleRunAutoCompaction = useCallback(async () => {
    setThinkingStatus(COMPACTION_THINKING_STATUS);
    setThinkingSourceEventType('context-compaction-started');
    await waitForNextPaint();
    const sessionInfo = getTranscriptSessionInfo();
    const conversationRef = getActiveConversationRef() || sessionInfo?.conversationRef || null;
    const userId = sessionInfo?.userId || null;
    if (conversationRef && userId) {
      try {
        const memories = await loadConversationTranscriptMemories({
          userId,
          conversationRef,
          recordKind: 'transcript',
        });
        await ApiClient.sendRehydrateConversation(
          conversationRef,
          memories.map(toRehydrateMessagePayload),
        );
      } catch (error) {
        console.warn('[ChatInterface] Failed to rehydrate conversation before compaction:', error);
      }
    }
    ApiClient.compactHistory(true);
  }, [setThinkingSourceEventType, setThinkingStatus]);

  const handleProviderSelect = useCallback((provider) => {
    setProviderMenuOpen(false);
    setReasoningModeMenuOpen(false);
    if (!provider || typeof updateConfig !== 'function') {
      return;
    }

    const selectedProvider = String(provider).trim();
    if (!selectedProvider) {
      return;
    }

    const providerModels = resolveProviderModels(availableModelPool, selectedProvider);

    let nextModelId = configuredModelId;
    const currentModelInProvider = providerModels.some(
      (model) => String(model?.id || '').trim() === configuredModelId,
    );
    if (!currentModelInProvider) {
      nextModelId = String(providerModels[0]?.id || '').trim();
    }

    updateConfig({
      model_provider: selectedProvider,
      selected_model_id: nextModelId,
    });
  }, [availableModelPool, configuredModelId, updateConfig]);

  const handleModelSelect = useCallback((option) => {
    setModelMenuOpen(false);
    setReasoningModeMenuOpen(false);
    if (!option || typeof updateConfig !== 'function') {
      return;
    }
    const nextModelId = resolveModelIdForReasoningMode(option, selectedReasoningMode);
    if (!nextModelId) {
      return;
    }
    updateConfig({
      selected_model_id: nextModelId,
      model_provider: option.provider || configuredProvider,
    });
  }, [configuredProvider, selectedReasoningMode, updateConfig]);

  const handleReasoningModeSelect = useCallback((mode) => {
    setReasoningModeMenuOpen(false);
    if (
      !selectedModelOption
      || !mode
      || typeof updateConfig !== 'function'
    ) {
      return;
    }
    const nextModelId = resolveModelIdForReasoningMode(selectedModelOption, mode);
    if (!nextModelId || nextModelId === configuredModelId) {
      return;
    }
    updateConfig({
      selected_model_id: nextModelId,
      model_provider: selectedModelOption.provider || configuredProvider,
    });
  }, [configuredModelId, configuredProvider, selectedModelOption, updateConfig]);

  const handleAssistantFeedbackChange = useCallback((messageId, feedback) => {
    updateMessage(messageId, { feedback });
  }, [updateMessage]);
  const { handleEditFromUser, handleTryAgainFromAssistant } = useConversationReplayActions({
    messages,
    setMessages,
    setThinkingStatus,
    setThinkingSourceEventType,
    setIsSending,
  });

  useChatInterfaceNewChatEvent(handleNewChat);

  const { sendMessage } = useChatMessageSender(stopPlayback, {
    senderSurface: 'main-window',
  });

  return (
    <div className="chat-container">
      <ChatInterfaceHeaderControls
        vmModeEnabled={vmModeEnabled}
        providerMenuRef={providerMenuRef}
        modelMenuRef={modelMenuRef}
        providerMenuOpen={providerMenuOpen}
        modelMenuOpen={modelMenuOpen}
        setProviderMenuOpen={setProviderMenuOpen}
        setModelMenuOpen={setModelMenuOpen}
        providerLabel={providerLabel}
        providerOptions={providerOptions}
        modelLabelBase={modelLabelBase}
        selectedModelOption={selectedModelOption}
        modelOptions={modelOptions}
        showReasoningModeSelector={showReasoningModeSelector}
        reasoningModeMenuRef={reasoningModeMenuRef}
        reasoningModeMenuOpen={reasoningModeMenuOpen}
        setReasoningModeMenuOpen={setReasoningModeMenuOpen}
        selectedReasoningModeLabel={selectedReasoningModeLabel}
        reasoningModeOptions={reasoningModeOptions}
        speechModeEnabled={speechModeEnabled}
        devUiEnabled={devUiEnabled}
        handleProviderSelect={handleProviderSelect}
        handleModelSelect={handleModelSelect}
        handleReasoningModeSelect={handleReasoningModeSelect}
        handleToggleSpeechMode={handleToggleSpeechMode}
        handleRunAutoCompaction={handleRunAutoCompaction}
        handleWindowMinimize={handleWindowMinimize}
        handleWindowToggleMaximize={handleWindowToggleMaximize}
        handleWindowClose={handleWindowClose}
      />
      {isTransportConnected ? null : (
        <div className="chat-connection-warning" role="alert">
          Cannot connect to server right now, try again later.
        </div>
      )}

      {messages.length === 0 ? (
        <div className="chat-empty-state" data-testid="chat-empty-state">
          <h1 className="chat-empty-title">Welcome to WindieOS Demo</h1>
          <MessageInput
            onSendMessage={sendMessage}
            isSending={composerBusy}
            voiceModeEnabled={voiceModeEnabled}
            onStopResponse={handleStopQuery}
            isCentered
            focusRequestToken={focusComposerToken}
          />
        </div>
      ) : (
        <>
          <MessageList
            messages={messages}
            conversationRef={transcriptSessionInfo.conversationRef || null}
            thinkingStatus={thinkingStatus}
            thinkingSourceEventType={thinkingSourceEventType}
            compactionDebugInfo={compactionDebugInfo}
            awaitingDotTargetMessageId={awaitingDotTargetMessageId}
            enableAgentLoopAutoScroll={composerBusy}
            enableAssistantActions
            enableUserActions
            disableAssistantActions={isSending || canStop}
            onAssistantFeedbackChange={handleAssistantFeedbackChange}
            onAssistantTryAgain={handleTryAgainFromAssistant}
            onUserEdit={handleEditFromUser}
          />
          <MessageInput
            onSendMessage={sendMessage}
            isSending={composerBusy}
            voiceModeEnabled={voiceModeEnabled}
            onStopResponse={handleStopQuery}
            focusRequestToken={focusComposerToken}
          />
        </>
      )}
    </div>
  );
}

export default ChatInterface;
