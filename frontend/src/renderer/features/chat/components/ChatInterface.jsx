import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { ChevronDown, Sparkles, Volume2, Workflow } from 'lucide-react';
import MessageList from './MessageList';
import MessageInput from './MessageInput';
import { useChatStore } from '../stores/chatStore';
import { useChatMessageSender } from '../hooks/useChatMessageSender';
import { useAppConfigContext } from '../../../app/providers/AppContextHooks';
import { ApiClient } from '../../../infrastructure/api/client';
import { PlayerService } from '../../../infrastructure/audio/PlayerService';
import { IpcBridge, ON_CHANNELS } from '../../../infrastructure/ipc/bridge';
import { extractAudioChunkPayload } from '../utils/backendAudioEvents';
import { selectChatInterfaceState } from '../utils/chatSelectors';
import { startNewChatSession } from '../utils/newChatSession';
import { loadConversationTranscriptMemories } from '../../../infrastructure/transcript/conversationTranscriptLoader';
import {
  getActiveConversationRef,
  getTranscriptSessionInfo,
} from '../../../infrastructure/transcript/TranscriptWriter';
import { toRehydrateMessagePayload } from '../../dashboard/utils/episodicMemoryUtils';
import {
  normalizeProvider,
} from '../utils/transcriptMessagePayload';
import { COMPACTION_THINKING_STATUS } from '../utils/chatStreamThinkingStatus';
import { useConversationReplayActions } from '../hooks/useConversationReplayActions';
import { isDevUiEnabled } from '../utils/devUiFlag';
import '../../../styles/ChatInterface.css';

const ACTIVE_STREAM_PHASES = new Set(['awaiting-first-chunk', 'streaming', 'tool-call', 'tool-output']);

function ChatInterface({ focusComposerToken = 0 }) {
  const { messages, isSending, thinkingStatus, thinkingSourceEventType, streamPhase } = useChatStore(
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

  const audioPlayerRef = useRef(null);

  useEffect(() => {
    audioPlayerRef.current = new PlayerService();
    return () => {
      audioPlayerRef.current?.cleanup();
    };
  }, []);

  useEffect(() => {
    const removeListener = IpcBridge.on(ON_CHANNELS.FROM_BACKEND, (data) => {
      const audioChunk = extractAudioChunkPayload(data);
      if (audioChunk && audioPlayerRef.current) {
        audioPlayerRef.current.enqueueAudio(audioChunk);
      }
    });
    return removeListener;
  }, []);

  const voiceModeEnabled = config?.voice_mode_enabled === true;
  const speechModeEnabled = config?.speech_mode_enabled === true;
  const canStop = ACTIVE_STREAM_PHASES.has(streamPhase);
  const composerBusy = isSending || canStop;
  const showAssistantAwaitingDot = (
    streamPhase === 'awaiting-first-chunk'
    && messages.length > 0
    && messages[messages.length - 1]?.sender === 'user'
  );
  const modelMode = config?.model_mode || 'online';
  const configuredProvider = config?.model_provider || '';
  const configuredModelId = config?.selected_model_id || '';
  const availableModelPool = useMemo(() => {
    const localModels = Array.isArray(availableModels?.local) ? availableModels.local : [];
    const onlineModels = Array.isArray(availableModels?.online) ? availableModels.online : [];
    return modelMode === 'local' ? localModels : onlineModels;
  }, [availableModels, modelMode]);
  const modelOptions = useMemo(() => {
    const normalizedSelectedProvider = normalizeProvider(configuredProvider);
    const seenModelIds = new Set();
    const options = [];

    availableModelPool.forEach((model) => {
      const modelId = String(model?.id || '').trim();
      if (!modelId || seenModelIds.has(modelId)) {
        return;
      }
      if (
        normalizedSelectedProvider
        && normalizeProvider(model?.provider) !== normalizedSelectedProvider
      ) {
        return;
      }
      seenModelIds.add(modelId);
      options.push({
        id: modelId,
        provider: String(model?.provider || configuredProvider || '').trim(),
      });
    });

    if (configuredModelId && !seenModelIds.has(configuredModelId)) {
      options.unshift({
        id: configuredModelId,
        provider: String(configuredProvider || '').trim(),
      });
      return options;
    }

    const selectedIndex = options.findIndex((option) => option.id === configuredModelId);
    if (selectedIndex > 0) {
      const [selectedOption] = options.splice(selectedIndex, 1);
      options.unshift(selectedOption);
    }

    return options;
  }, [availableModelPool, configuredModelId, configuredProvider]);
  const providerOptions = useMemo(() => {
    const seenProviders = new Set();
    const options = [];

    availableModelPool.forEach((model) => {
      const provider = String(model?.provider || '').trim();
      if (!provider || seenProviders.has(provider)) {
        return;
      }
      seenProviders.add(provider);
      options.push(provider);
    });

    options.sort((left, right) => left.localeCompare(right));

    if (
      configuredProvider
      && !options.some((provider) => normalizeProvider(provider) === normalizeProvider(configuredProvider))
    ) {
      options.unshift(configuredProvider);
    }

    return options;
  }, [availableModelPool, configuredProvider]);
  const providerLabel = configuredProvider || providerOptions[0] || 'No providers available';
  const modelLabel = configuredModelId || modelOptions[0]?.id || 'No models available';
  const devUiEnabled = isDevUiEnabled();
  const [providerMenuOpen, setProviderMenuOpen] = useState(false);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const providerMenuRef = useRef(null);
  const modelMenuRef = useRef(null);

  useEffect(() => {
    const handlePointerDown = (event) => {
      if (
        providerMenuRef.current
        && !providerMenuRef.current.contains(event.target)
      ) {
        setProviderMenuOpen(false);
      }
      if (
        modelMenuRef.current
        && !modelMenuRef.current.contains(event.target)
      ) {
        setModelMenuOpen(false);
      }
    };
    window.addEventListener('mousedown', handlePointerDown);
    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
    };
  }, []);

  const stopPlayback = useCallback(() => {
    audioPlayerRef.current?.stopPlayback();
  }, []);

  const handleStopQuery = useCallback(() => {
    if (!canStop) {
      return;
    }
    const stoppedAt = new Date().toISOString();
    setIsSending(false);
    setThinkingStatus(null);
    setThinkingSourceEventType(null);
    updateStreamTracking((current) => ({
      ...current,
      phase: 'complete',
      completedAt: stoppedAt,
      lastEventAt: stoppedAt,
      lastEventType: 'stop-query',
    }));
    stopPlayback();
    ApiClient.stopQuery();
  }, [canStop, setIsSending, setThinkingSourceEventType, setThinkingStatus, stopPlayback, updateStreamTracking]);

  const handleNewChat = useCallback(() => {
    startNewChatSession({
      clearMessages,
      setIsSending,
      setThinkingStatus,
      setTokenCounts,
      stopActiveQuery: canStop
        ? () => {
          stopPlayback();
          ApiClient.stopQuery();
        }
        : undefined,
    });
  }, [
    canStop,
    clearMessages,
    setIsSending,
    setThinkingStatus,
    setTokenCounts,
    stopPlayback,
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
    if (!provider || typeof updateConfig !== 'function') {
      return;
    }

    const selectedProvider = String(provider).trim();
    if (!selectedProvider) {
      return;
    }

    const normalizedSelectedProvider = normalizeProvider(selectedProvider);
    const providerModels = availableModelPool.filter(
      (model) => normalizeProvider(model?.provider) === normalizedSelectedProvider,
    );

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
    if (!option || typeof updateConfig !== 'function') {
      return;
    }
    updateConfig({
      selected_model_id: option.id,
      model_provider: option.provider || configuredProvider,
    });
  }, [configuredProvider, updateConfig]);

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

  useEffect(() => {
    const handleDashboardNewChat = () => {
      handleNewChat();
    };
    window.addEventListener('windie:new-chat', handleDashboardNewChat);
    return () => {
      window.removeEventListener('windie:new-chat', handleDashboardNewChat);
    };
  }, [handleNewChat]);

  const { sendMessage } = useChatMessageSender(stopPlayback, {
    senderSurface: 'main-window',
  });

  return (
    <div className="chat-container">
      <header className="chat-header">
        <div className="chat-title-block">
          <div className="chat-model-row">
            <div className="chat-provider-dropdown" ref={providerMenuRef}>
              <button
                type="button"
                className="chat-provider-selector"
                aria-label="Provider selector"
                aria-expanded={providerMenuOpen}
                onClick={() => {
                  setProviderMenuOpen((current) => !current);
                  setModelMenuOpen(false);
                }}
              >
                <span>{providerLabel}</span>
                <ChevronDown size={14} />
              </button>
              {providerMenuOpen ? (
                <div className="chat-provider-menu" role="menu">
                  {providerOptions.length > 0 ? (
                    providerOptions.map((provider) => (
                      <button
                        key={provider}
                        type="button"
                        className="chat-provider-menu-item"
                        role="menuitem"
                        onClick={() => {
                          handleProviderSelect(provider);
                        }}
                      >
                        <span>{provider}</span>
                      </button>
                    ))
                  ) : (
                    <div className="chat-provider-menu-item" aria-disabled="true">
                      <span>No providers available</span>
                    </div>
                  )}
                </div>
              ) : null}
            </div>
            <div className="chat-model-dropdown" ref={modelMenuRef}>
              <button
                type="button"
                className="chat-model-selector"
                aria-label="Model selector"
                aria-expanded={modelMenuOpen}
                onClick={() => {
                  setModelMenuOpen((current) => !current);
                  setProviderMenuOpen(false);
                }}
              >
                <span>{modelLabel}</span>
                <ChevronDown size={14} />
              </button>
              {modelMenuOpen ? (
                <div className="chat-model-menu" role="menu">
                  {modelOptions.length > 0 ? (
                    modelOptions.map((option) => (
                      <button
                        key={`${option.provider || 'unknown'}:${option.id}`}
                        type="button"
                        className="chat-model-menu-item"
                        role="menuitem"
                        onClick={() => {
                          handleModelSelect(option);
                        }}
                      >
                        <Sparkles size={16} />
                        <span>{option.id}</span>
                      </button>
                    ))
                  ) : (
                    <div className="chat-model-menu-item" aria-disabled="true">
                      <Sparkles size={16} />
                      <span>No models available</span>
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          </div>
        </div>
        <div className="chat-meta">
          <div className="chat-utility-controls">
            <button
              type="button"
              className={`chat-top-icon-btn${speechModeEnabled ? ' is-enabled' : ''}`}
              aria-label="Toggle text-to-speech"
              title={speechModeEnabled ? 'Disable text-to-speech' : 'Enable text-to-speech'}
              onClick={handleToggleSpeechMode}
            >
              <Volume2 size={18} />
            </button>
            {devUiEnabled ? (
              <button
                type="button"
                className="chat-top-icon-btn"
                aria-label="Run auto compaction"
                title="Run auto compaction"
                onClick={handleRunAutoCompaction}
              >
                <Workflow size={18} />
              </button>
            ) : null}
          </div>
        </div>
      </header>

      {messages.length === 0 ? (
        <div className="chat-empty-state" data-testid="chat-empty-state">
          <h1 className="chat-empty-title">Good to see you, peter.</h1>
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
            thinkingStatus={thinkingStatus}
            thinkingSourceEventType={thinkingSourceEventType}
            showAssistantAwaitingDot={showAssistantAwaitingDot}
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
