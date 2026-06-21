/**
 * Provides the chat interface module for the renderer UI.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import MessageList from './MessageList';
import MessageInput from './MessageInput';
import ChatInterfaceHeaderControls from './ChatInterfaceHeaderControls';
import ChatFindBar from './ChatFindBar';
import { selectChatInterfaceState, useChatStore } from '../stores/chatStore';
import { useChatMessageSender } from '../hooks/useChatMessageSender';
import {
  useChatInterfaceAudioChunkStream,
  useChatInterfaceFindShortcut,
  useChatInterfaceMenuDismiss,
  useChatInterfaceNewChatEvent,
  useChatInterfaceStopShortcut,
} from '../hooks/useChatInterfaceBindings';
import { DesktopRendererConfigRuntimeClient } from '../../../app/runtime/desktopRendererConfigRuntimeClient';
import { DesktopRuntimeSkin } from '../../../app/skin/desktopRuntimeSkin';
import { DesktopAudioRuntimeClient } from '../../../app/runtime/desktopAudioRuntimeClient';
import { DesktopWorkspaceRuntimeClient } from '../../../app/runtime/desktopWorkspaceRuntimeClient';
import { useRendererConversationSessionInfo } from '../session/useRendererConversationSessionInfo';
import { DesktopNewChatSessionRuntime } from '../../../app/runtime/desktopNewChatSessionRuntime';
import {
  DesktopChatModelOptionsRuntime,
} from '../../../app/runtime/desktopChatModelOptionsRuntime';
import { useConversationReplayActions } from '../hooks/useConversationReplayActions';
import { DesktopDevUiRuntime } from '../../../app/runtime/desktopDevUiRuntime';
import { useChatSurfaceController } from '../hooks/useChatSurfaceController';
import { useStopTurnHandler } from '../hooks/useStopTurnHandler';
import { DesktopStartupRuntimeClient } from '../../../app/runtime/desktopStartupRuntimeClient';
import { useMainWindowControls } from '../../../hooks/useMainWindowControls';
import {
  DesktopThreadPresentationRuntime,
} from '../../../app/runtime/desktopThreadPresentationRuntime';
import { DesktopThreadFindRuntime } from '../../../app/runtime/desktopThreadFindRuntime';
import '../../../styles/ChatInterface.css';

const chatSkin = DesktopRuntimeSkin.desktopRuntimeSkin.chat;
const {
  buildChatModelOptions,
  buildChatProviderOptions,
  formatProviderLabel,
  getAvailableModelPool,
  resolveModelIdForReasoningMode,
  resolveProviderModels,
  resolveSelectedReasoningMode,
  resolveSelectedModelOption,
} = DesktopChatModelOptionsRuntime;
const {
  buildThreadPresentationMessages,
} = DesktopThreadPresentationRuntime;
const { buildThreadFindState } = DesktopThreadFindRuntime;
const { isDevUiEnabled } = DesktopDevUiRuntime;
const { startNewChatSession } = DesktopNewChatSessionRuntime;

function workspaceStateMatches(currentWorkspace, nextWorkspace) {
  return (
    currentWorkspace?.activeWorkspaceName === nextWorkspace?.activeWorkspaceName
    && currentWorkspace?.activeWorkspacePath === nextWorkspace?.activeWorkspacePath
  );
}

function ChatInterface({ focusComposerToken = 0, loadingConversationRef = null }) {
  const vmModeEnabled = DesktopStartupRuntimeClient.isVmModeEnabled();

  const {
    messages,
    isSending,
    thinkingStatus,
    thinkingSourceEventType,
    compactionDebugInfo,
    currentTurnProjection,
    pendingTurn,
  } = useChatStore(
    useShallow(selectChatInterfaceState),
  );
  const clearMessages = useChatStore((state) => state.clearMessages);
  const setMessages = useChatStore((state) => state.setMessages);
  const setChatActiveConversationRef = useChatStore((state) => state.setActiveConversationRef);
  const updateMessage = useChatStore((state) => state.updateMessage);
  const setIsSending = useChatStore((state) => state.setIsSending);
  const setThinkingStatus = useChatStore((state) => state.setThinkingStatus);
  const setThinkingSourceEventType = useChatStore((state) => state.setThinkingSourceEventType);
  const setTokenCounts = useChatStore((state) => state.setTokenCounts);
  const { config, updateConfig, availableModels } = (
    DesktopRendererConfigRuntimeClient.useDesktopRendererConfigContext()
  );
  const sessionInfo = useRendererConversationSessionInfo();
  const [activeWorkspace, setActiveWorkspace] = useState(() => ({
    activeWorkspaceName: '',
    activeWorkspacePath: '',
  }));

  const audioPlayerRef = useRef(null);
  const activeWorkspaceRef = useRef(activeWorkspace);
  const workspaceRefreshRequestIdRef = useRef(0);
  const workspaceSelectionVersionRef = useRef(0);
  const startWorkspaceBoundNewChat = useCallback((workspace) => {
    return startNewChatSession({
      clearMessages,
      setIsSending,
      setThinkingStatus,
      setTokenCounts,
      setChatActiveConversationRef,
      workspace,
    });
  }, [
    clearMessages,
    setChatActiveConversationRef,
    setIsSending,
    setThinkingStatus,
    setTokenCounts,
  ]);

  useEffect(() => {
    audioPlayerRef.current = DesktopAudioRuntimeClient.createAudioPlayer();
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
        const nextWorkspace = await DesktopWorkspaceRuntimeClient.fetchActiveWorkspace();
        if (
          cancelled
          || requestId !== workspaceRefreshRequestIdRef.current
          || selectionVersionAtRequestStart !== workspaceSelectionVersionRef.current
        ) {
          return;
        }
        applyActiveWorkspace(nextWorkspace);
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

    const removeWorkspaceAccessUpdated = DesktopWorkspaceRuntimeClient.onWorkspaceSelectionUpdated(
      (nextWorkspace, isWorkspacePickerSelection) => {
        applyActiveWorkspace(nextWorkspace, { markSelectionChange: true });

        if (isWorkspacePickerSelection !== true) {
          return;
        }

        const currentBinding = DesktopWorkspaceRuntimeClient.getConversationWorkspaceBinding(
          sessionInfo.conversationRef || null,
        );
        const nextBinding = DesktopWorkspaceRuntimeClient.workspaceSelectionToBinding(nextWorkspace);
        if (DesktopWorkspaceRuntimeClient.areWorkspaceBindingsEqual(currentBinding, nextBinding)) {
          return;
        }
        startWorkspaceBoundNewChat(nextWorkspace);
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
  }, [sessionInfo.conversationRef, startWorkspaceBoundNewChat]);

  const showToolLogs = config?.show_tool_logs === true;
  const chatSurface = useChatSurfaceController({
    isSending,
    messages,
    currentTurnProjection,
    pendingTurn,
    sessionInfo,
    setThinkingStatus,
    setThinkingSourceEventType,
    allowManualCompactionWhileBusy: true,
    warningContext: 'ChatInterface',
  });
  const {
    currentTurnPresentationState: {
      awaitingDotTargetMessageId,
    },
    isBusy: composerBusy,
    canStop,
    speechModeEnabled,
  } = chatSurface;
  const renderedMessages = useMemo(() => buildThreadPresentationMessages(messages, {
    showToolLogs,
    isBusy: composerBusy,
    currentTurnProjection,
    activeConversationRef: sessionInfo.conversationRef || null,
  }), [composerBusy, currentTurnProjection, messages, sessionInfo.conversationRef, showToolLogs]);
  const activeConversationRef = sessionInfo.conversationRef || null;
  const isLoadingSelectedConversation = (
    typeof loadingConversationRef === 'string'
    && loadingConversationRef.length > 0
    && loadingConversationRef === activeConversationRef
    && renderedMessages.length === 0
  );
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
  const { handleStopTurn } = useStopTurnHandler({
    enabled: composerBusy,
    currentTurnProjection,
    pendingTurn,
    sessionConversationRef: sessionInfo.conversationRef,
    stopPlayback,
    warningContext: 'ChatInterface',
  });

  useChatInterfaceStopShortcut(canStop, handleStopTurn);

  const handleNewChat = useCallback(() => {
    startWorkspaceBoundNewChat(activeWorkspaceRef.current);
  }, [startWorkspaceBoundNewChat]);

  const handleToggleSpeechMode = useCallback(() => {
    chatSurface.toggleSpeechMode();
  }, [chatSurface]);

  const handleChangeWorkspace = useCallback(async () => {
    try {
      const nextWorkspace = await DesktopWorkspaceRuntimeClient.requestGrantedActiveWorkspace();
      if (nextWorkspace) {
        activeWorkspaceRef.current = nextWorkspace;
        setActiveWorkspace(nextWorkspace);
      }
    } catch (error) {
      console.warn('[ChatInterface] Failed to change active workspace:', error);
    }
  }, []);

  const handleRunAutoCompaction = useCallback(async () => {
    await chatSurface.runManualCompaction();
  }, [chatSurface]);

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
      {isLoadingSelectedConversation ? (
        <div className="chat-history-loading-state" data-testid="chat-history-loading-state">
          <div className="chat-history-loading-spinner" aria-hidden="true" />
          <div className="chat-history-loading-title">Loading chat</div>
        </div>
      ) : renderedMessages.length === 0 ? (
        <div className="chat-empty-state" data-testid="chat-empty-state">
          <h1 className="chat-empty-title">{chatSkin.emptyTitle}</h1>
          <MessageInput
            onSendMessage={sendMessage}
            isSending={composerBusy}
            onStopResponse={handleStopTurn}
            isCentered
            focusRequestToken={focusComposerToken}
          />
        </div>
      ) : (
        <>
          <MessageList
            messages={renderedMessages}
            conversationRef={sessionInfo.conversationRef || null}
            thinkingStatus={thinkingStatus}
            thinkingSourceEventType={thinkingSourceEventType}
            compactionDebugInfo={compactionDebugInfo}
            awaitingDotTargetMessageId={awaitingDotTargetMessageId}
            findQuery={normalizedFindQuery}
            messageFindMatchIndexesById={threadFindState.messageMatchIndexesById}
            activeFindMatchIndex={resolvedActiveFindMatchIndex}
            enableAgentLoopAutoScroll={composerBusy}
            enableAssistantActions
            enableUserActions
            disableAssistantActions={composerBusy || canStop}
            onAssistantFeedbackChange={handleAssistantFeedbackChange}
            onAssistantTryAgain={handleTryAgainFromAssistant}
            onUserEdit={handleEditFromUser}
          />
          <MessageInput
            onSendMessage={sendMessage}
            isSending={composerBusy}
            onStopResponse={handleStopTurn}
            focusRequestToken={focusComposerToken}
          />
        </>
      )}
    </div>
  );
}

export default ChatInterface;
