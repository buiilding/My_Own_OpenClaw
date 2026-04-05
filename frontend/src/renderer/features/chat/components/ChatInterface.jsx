import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import MessageList from './MessageList';
import MessageInput from './MessageInput';
import ChatInterfaceHeaderControls from './ChatInterfaceHeaderControls';
import ChatFindBar from './ChatFindBar';
import { useChatStore } from '../stores/chatStore';
import { useChatMessageSender } from '../hooks/useChatMessageSender';
import {
  useChatInterfaceAudioChunkStream,
  useChatInterfaceFindShortcut,
  useChatInterfaceMenuDismiss,
  useChatInterfaceNewChatEvent,
  useChatInterfaceStopShortcut,
} from '../hooks/useChatInterfaceBindings';
import { useAppConfigContext } from '../../../app/providers/AppContextHooks';
import { buildDeferredQueryModelConfig } from '../../../app/providers/appConfigBackendSync';
import { ApiClient } from '../../../infrastructure/api/client';
import { PlayerService } from '../../../infrastructure/audio/PlayerService';
import { IpcBridge, ON_CHANNELS } from '../../../infrastructure/ipc/bridge';
import { selectChatInterfaceState } from '../utils/chatSelectors';
import { ensureConversationBackendState } from '../session/conversationBackendSyncRuntime';
import { startNewChatSession } from '../utils/session/newChatSession';
import {
  getActiveConversationRef,
  getTranscriptSessionInfo,
} from '../../../infrastructure/transcript/TranscriptWriter';
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
  fetchActiveWorkspaceSelection,
  requestActiveWorkspaceSelection,
} from '../../../infrastructure/workspace/workspaceAccess';
import {
  VISIBLE_ASSISTANT_REPLY_TYPE_SET,
} from '../utils/state/chatTurnPresentationState';
import { buildThreadPresentationMessages } from '../utils/message/messagePresentationPipeline';
import { buildThreadFindState } from '../utils/message/threadFindState';
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

function workspaceStateMatches(currentWorkspace, nextWorkspace) {
  return (
    currentWorkspace?.activeWorkspaceName === nextWorkspace?.activeWorkspaceName
    && currentWorkspace?.activeWorkspacePath === nextWorkspace?.activeWorkspacePath
  );
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
  const [activeWorkspace, setActiveWorkspace] = useState(() => ({
    activeWorkspaceName: '',
    activeWorkspacePath: '',
  }));

  const audioPlayerRef = useRef(null);
  const activeWorkspaceRef = useRef(activeWorkspace);
  const workspaceRefreshRequestIdRef = useRef(0);
  const workspaceSelectionVersionRef = useRef(0);

  useEffect(() => {
    audioPlayerRef.current = new PlayerService();
    return () => {
      audioPlayerRef.current?.cleanup();
    };
  }, []);

  useChatInterfaceAudioChunkStream(audioPlayerRef);

  useEffect(() => {
    let cancelled = false;

    const applyActiveWorkspace = (nextWorkspace, { markSelectionChange = false } = {}) => {
      if (markSelectionChange) {
        workspaceSelectionVersionRef.current += 1;
      }
      if (workspaceStateMatches(activeWorkspaceRef.current, nextWorkspace)) {
        return;
      }
      activeWorkspaceRef.current = nextWorkspace;
      setActiveWorkspace(nextWorkspace);
    };

    const refreshActiveWorkspace = async () => {
      const requestId = workspaceRefreshRequestIdRef.current + 1;
      workspaceRefreshRequestIdRef.current = requestId;
      const selectionVersionAtRequestStart = workspaceSelectionVersionRef.current;
      try {
        const result = await fetchActiveWorkspaceSelection();
        if (
          cancelled
          || requestId !== workspaceRefreshRequestIdRef.current
          || selectionVersionAtRequestStart !== workspaceSelectionVersionRef.current
        ) {
          return;
        }
        applyActiveWorkspace(result.workspace);
      } catch (_error) {
        if (
          !cancelled
          && requestId === workspaceRefreshRequestIdRef.current
          && selectionVersionAtRequestStart === workspaceSelectionVersionRef.current
        ) {
          applyActiveWorkspace({
            activeWorkspaceName: '',
            activeWorkspacePath: '',
          });
        }
      }
    };

    void refreshActiveWorkspace();

    const removeWorkspaceAccessUpdated = IpcBridge.on(
      ON_CHANNELS.WORKSPACE_ACCESS_UPDATED,
      (payload = {}) => {
        applyActiveWorkspace({
          activeWorkspaceName: typeof payload?.workspaceName === 'string' ? payload.workspaceName : '',
          activeWorkspacePath: typeof payload?.workspacePath === 'string' ? payload.workspacePath : '',
        }, { markSelectionChange: true });
      },
    );

    const handleWindowFocus = () => {
      void refreshActiveWorkspace();
    };
    window.addEventListener('focus', handleWindowFocus);

    return () => {
      cancelled = true;
      removeWorkspaceAccessUpdated?.();
      window.removeEventListener('focus', handleWindowFocus);
    };
  }, []);

  const speechModeEnabled = config?.speech_mode_enabled === true;
  const showToolLogs = config?.show_tool_logs === true;
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
  const renderedMessages = useMemo(() => buildThreadPresentationMessages(messages, {
    showToolLogs,
    isBusy: composerBusy,
  }), [composerBusy, messages, showToolLogs]);
  const hasLiveToolExplanationMessages = useMemo(() => (
    renderedMessages.some((message) => message?.type === 'tool-explanation')
  ), [renderedMessages]);
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
  const [findBarOpen, setFindBarOpen] = useState(false);
  const [findQuery, setFindQuery] = useState('');
  const [activeFindMatchIndex, setActiveFindMatchIndex] = useState(0);
  const [findFocusToken, setFindFocusToken] = useState(0);
  const providerMenuRef = useRef(null);
  const modelMenuRef = useRef(null);
  const reasoningModeMenuRef = useRef(null);
  const findInputRef = useRef(null);
  const previousFindQueryRef = useRef('');
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

  const normalizedFindQuery = useMemo(() => findQuery.trim(), [findQuery]);
  const threadFindState = useMemo(() => buildThreadFindState(renderedMessages, normalizedFindQuery), [
    normalizedFindQuery,
    renderedMessages,
  ]);
  const totalFindMatches = threadFindState.totalMatches;
  const resolvedActiveFindMatchIndex = normalizedFindQuery && totalFindMatches > 0
    ? activeFindMatchIndex
    : null;

  const handleOpenFind = useCallback(() => {
    setFindBarOpen(true);
    setFindFocusToken((current) => current + 1);
  }, []);

  const handleCloseFind = useCallback(() => {
    setFindBarOpen(false);
    setFindQuery('');
    setActiveFindMatchIndex(0);
  }, []);

  const handleNextFindMatch = useCallback(() => {
    if (totalFindMatches <= 0) {
      return;
    }
    setActiveFindMatchIndex((current) => (current + 1) % totalFindMatches);
  }, [totalFindMatches]);

  const handlePreviousFindMatch = useCallback(() => {
    if (totalFindMatches <= 0) {
      return;
    }
    setActiveFindMatchIndex((current) => (current - 1 + totalFindMatches) % totalFindMatches);
  }, [totalFindMatches]);

  useEffect(() => {
    if (!findBarOpen) {
      return undefined;
    }

    const focusInput = () => {
      findInputRef.current?.focus();
      findInputRef.current?.select();
    };

    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      const frameId = window.requestAnimationFrame(focusInput);
      return () => {
        window.cancelAnimationFrame(frameId);
      };
    }

    focusInput();
    return undefined;
  }, [findBarOpen, findFocusToken]);

  useEffect(() => {
    if (normalizedFindQuery !== previousFindQueryRef.current) {
      previousFindQueryRef.current = normalizedFindQuery;
      setActiveFindMatchIndex(0);
      return;
    }

    if (totalFindMatches === 0) {
      setActiveFindMatchIndex(0);
      return;
    }

    setActiveFindMatchIndex((current) => (
      current >= totalFindMatches ? totalFindMatches - 1 : current
    ));
  }, [normalizedFindQuery, totalFindMatches]);

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
    });
  }, [
    clearMessages,
    setIsSending,
    setThinkingStatus,
    setTokenCounts,
  ]);

  const handleToggleSpeechMode = useCallback(() => {
    if (typeof updateConfig !== 'function') {
      return;
    }
    updateConfig({
      speech_mode_enabled: !speechModeEnabled,
    });
  }, [speechModeEnabled, updateConfig]);

  const handleChangeWorkspace = useCallback(async () => {
    try {
      const result = await requestActiveWorkspaceSelection();
      if (result?.status?.granted === true) {
        activeWorkspaceRef.current = result.workspace;
        setActiveWorkspace(result.workspace);
      }
    } catch (error) {
      console.warn('[ChatInterface] Failed to change active workspace:', error);
    }
  }, []);

  const handleRunAutoCompaction = useCallback(async () => {
    setThinkingStatus(COMPACTION_THINKING_STATUS);
    setThinkingSourceEventType('context-compaction-started');
    await waitForNextPaint();
    const deferredQueryModelConfig = buildDeferredQueryModelConfig(config);
    if (deferredQueryModelConfig) {
      ApiClient.updateSettings(deferredQueryModelConfig);
    }
    const sessionInfo = getTranscriptSessionInfo();
    const conversationRef = getActiveConversationRef() || sessionInfo?.conversationRef || null;
    if (conversationRef) {
      try {
        await ensureConversationBackendState({
          conversationRef,
          userId: sessionInfo?.userId || null,
        });
      } catch (error) {
        console.warn('[ChatInterface] Failed to rehydrate conversation before compaction:', error);
      }
    }
    ApiClient.compactHistory(true, conversationRef);
  }, [config, setThinkingSourceEventType, setThinkingStatus]);

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
  useChatInterfaceFindShortcut({
    isFindOpen: findBarOpen,
    handleOpenFind,
    handleCloseFind,
  });

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
        findBarOpen={findBarOpen}
        activeWorkspaceName={activeWorkspace.activeWorkspaceName}
        activeWorkspacePath={activeWorkspace.activeWorkspacePath}
        handleOpenFind={handleOpenFind}
        handleChangeWorkspace={handleChangeWorkspace}
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
      {findBarOpen ? (
        <ChatFindBar
          query={findQuery}
          totalMatches={totalFindMatches}
          activeMatchIndex={totalFindMatches > 0 ? activeFindMatchIndex : 0}
          inputRef={findInputRef}
          onQueryChange={setFindQuery}
          onPreviousMatch={handlePreviousFindMatch}
          onNextMatch={handleNextFindMatch}
          onClose={handleCloseFind}
        />
      ) : null}
      {isTransportConnected ? null : (
        <div className="chat-connection-warning" role="alert">
          Cannot connect to server right now, try again later.
        </div>
      )}

      {renderedMessages.length === 0 ? (
        <div className="chat-empty-state" data-testid="chat-empty-state">
          <h1 className="chat-empty-title">Welcome to WindieOS Demo</h1>
          <MessageInput
            onSendMessage={sendMessage}
            isSending={composerBusy}
            onStopResponse={handleStopQuery}
            isCentered
            focusRequestToken={focusComposerToken}
          />
        </div>
      ) : (
        <>
          <MessageList
            messages={renderedMessages}
            conversationRef={transcriptSessionInfo.conversationRef || null}
            thinkingStatus={thinkingStatus}
            thinkingSourceEventType={thinkingSourceEventType}
            compactionDebugInfo={compactionDebugInfo}
            awaitingDotTargetMessageId={hasLiveToolExplanationMessages ? null : awaitingDotTargetMessageId}
            findQuery={normalizedFindQuery}
            messageFindMatchIndexesById={threadFindState.messageMatchIndexesById}
            activeFindMatchIndex={resolvedActiveFindMatchIndex}
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
            onStopResponse={handleStopQuery}
            focusRequestToken={focusComposerToken}
          />
        </>
      )}
    </div>
  );
}

export default ChatInterface;
