import { useCallback, useEffect, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';
import MessageList from './MessageList';
import MessageInput from './MessageInput';
import TokenCountDisplay from './TokenCountDisplay';
import { useChatStore } from '../stores/chatStore';
import { useChatMessageSender } from '../hooks/useChatMessageSender';
import { useAppConfigContext } from '../../../app/providers/AppContextHooks';
import { ApiClient } from '../../../infrastructure/api/client';
import { PlayerService } from '../../../infrastructure/audio/PlayerService';
import { setActiveConversationRef } from '../../../infrastructure/transcript/TranscriptWriter';
import { IpcBridge, INVOKE_CHANNELS, ON_CHANNELS } from '../../../infrastructure/ipc/bridge';
import { extractAudioChunkPayload } from '../utils/backendAudioEvents';
import { selectChatInterfaceState } from '../utils/chatSelectors';
import '../../../styles/ChatInterface.css';

const ACTIVE_STREAM_PHASES = new Set(['awaiting-first-chunk', 'streaming', 'tool-call', 'tool-output']);

/**
 * A clean and simple chat interface component.
 * Orchestrates the chat interaction using store and hooks.
 */
function ChatInterface() {
  const { messages, isSending, thinkingStatus, tokenCounts, streamPhase } = useChatStore(
    useShallow(selectChatInterfaceState),
  );
  const clearMessages = useChatStore((state) => state.clearMessages);
  const setIsSending = useChatStore((state) => state.setIsSending);
  const setThinkingStatus = useChatStore((state) => state.setThinkingStatus);
  const setTokenCounts = useChatStore((state) => state.setTokenCounts);
  const updateStreamTracking = useChatStore((state) => state.updateStreamTracking);
  // Use AppConfigContext directly for better performance
  // This avoids re-renders when saveStatus changes in AppStatusContext
  const { config } = useAppConfigContext();
  
  // Audio player service
  const audioPlayerRef = useRef(null);
  
  useEffect(() => {
    audioPlayerRef.current = new PlayerService();
    return () => {
      audioPlayerRef.current?.cleanup();
    };
  }, []);

  // Audio chunk handler
  useEffect(() => {
    const removeListener = IpcBridge.on(ON_CHANNELS.FROM_BACKEND, (data) => {
      const audioChunk = extractAudioChunkPayload(data);
      if (audioChunk && audioPlayerRef.current) {
        audioPlayerRef.current.enqueueAudio(audioChunk);
      }
    });
    return removeListener;
  }, []);

  const interactionMode = config?.interaction_mode || 'chat';
  const voiceModeEnabled = config?.voice_mode_enabled === true;
  const interactionModeLabel = interactionMode === 'agent' ? 'Agent' : 'Chat';
  const canStop = ACTIVE_STREAM_PHASES.has(streamPhase);

  const stopPlayback = useCallback(() => {
    audioPlayerRef.current?.stopPlayback();
  }, []);

  const handleWindowMinimize = useCallback(() => {
    IpcBridge.invoke(INVOKE_CHANNELS.WINDOW_MINIMIZE).catch((error) => {
      console.warn('[ChatInterface] Failed to minimize window:', error);
    });
  }, []);

  const handleWindowToggleMaximize = useCallback(() => {
    IpcBridge.invoke(INVOKE_CHANNELS.WINDOW_TOGGLE_MAXIMIZE).catch((error) => {
      console.warn('[ChatInterface] Failed to toggle maximize:', error);
    });
  }, []);

  const handleWindowClose = useCallback(() => {
    IpcBridge.invoke(INVOKE_CHANNELS.WINDOW_CLOSE).catch((error) => {
      console.warn('[ChatInterface] Failed to close window:', error);
    });
  }, []);

  const handleStopQuery = useCallback(() => {
    if (!canStop) {
      return;
    }
    const stoppedAt = new Date().toISOString();
    setIsSending(false);
    setThinkingStatus(null);
    updateStreamTracking((current) => ({
      ...current,
      phase: 'complete',
      completedAt: stoppedAt,
      lastEventAt: stoppedAt,
      lastEventType: 'stop-query',
    }));
    stopPlayback();
    ApiClient.stopQuery();
  }, [canStop, setIsSending, setThinkingStatus, stopPlayback, updateStreamTracking]);

  const handleNewChat = useCallback(() => {
    if (canStop) {
      stopPlayback();
      ApiClient.stopQuery();
    }
    clearMessages();
    setIsSending(false);
    setThinkingStatus(null);
    setTokenCounts(null);
    setActiveConversationRef(null);
  }, [
    canStop,
    clearMessages,
    setIsSending,
    setThinkingStatus,
    setTokenCounts,
    stopPlayback,
  ]);

  const { sendMessage } = useChatMessageSender(stopPlayback, {
    senderSurface: 'main-window',
  });

  return (
    <div className="chat-container">
      <header className="chat-header">
        <div className="chat-title-block">
          <div className="chat-title">Conversation</div>
        </div>
        <div className="chat-meta">
          <div className="chat-window-controls">
            <button
              type="button"
              className="chat-window-control-btn chat-window-control-minimize"
              onClick={handleWindowMinimize}
              aria-label="Minimize window"
              title="Minimize"
            >
              <span className="chat-window-control-icon">-</span>
            </button>
            <button
              type="button"
              className="chat-window-control-btn chat-window-control-maximize"
              onClick={handleWindowToggleMaximize}
              aria-label="Toggle maximize window"
              title="Maximize / Restore"
            >
              <span className="chat-window-control-icon chat-window-control-square">□</span>
            </button>
            <button
              type="button"
              className="chat-window-control-btn chat-window-control-close"
              onClick={handleWindowClose}
              aria-label="Close window"
              title="Close"
            >
              <span className="chat-window-control-icon">×</span>
            </button>
          </div>
          <div className="chat-meta-lower">
            <div className={`chat-mode-badge chat-mode-${interactionMode}`}>
              Mode: {interactionModeLabel}
            </div>
            <button
              type="button"
              className="chat-new-chat-button"
              onClick={handleNewChat}
              aria-label="New chat"
              title="New chat"
            >
              New Chat
            </button>
            <button
              type="button"
              className="chat-stop-button"
              onClick={handleStopQuery}
              disabled={!canStop}
              aria-label="Stop response"
              title="Stop response"
            >
              Stop
            </button>
            <TokenCountDisplay tokenCounts={tokenCounts} />
          </div>
        </div>
      </header>
      <MessageList messages={messages} thinkingStatus={thinkingStatus} />
      <MessageInput 
        onSendMessage={sendMessage} 
        isSending={isSending}
        voiceModeEnabled={voiceModeEnabled}
      />
    </div>
  );
}

export default ChatInterface;
