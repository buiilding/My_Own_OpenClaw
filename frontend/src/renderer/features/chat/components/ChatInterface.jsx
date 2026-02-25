import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { ChevronDown } from 'lucide-react';
import MessageList from './MessageList';
import MessageInput from './MessageInput';
import TokenCountDisplay from './TokenCountDisplay';
import { useChatStore } from '../stores/chatStore';
import { useChatMessageSender } from '../hooks/useChatMessageSender';
import { useAppConfigContext } from '../../../app/providers/AppContextHooks';
import { ApiClient } from '../../../infrastructure/api/client';
import { PlayerService } from '../../../infrastructure/audio/PlayerService';
import { IpcBridge, INVOKE_CHANNELS, ON_CHANNELS } from '../../../infrastructure/ipc/bridge';
import { extractAudioChunkPayload } from '../utils/backendAudioEvents';
import { selectChatInterfaceState } from '../utils/chatSelectors';
import { startNewChatSession } from '../utils/newChatSession';
import '../../../styles/ChatInterface.css';

const ACTIVE_STREAM_PHASES = new Set(['awaiting-first-chunk', 'streaming', 'tool-call', 'tool-output']);

function ChatInterface() {
  const { messages, isSending, thinkingStatus, tokenCounts, streamPhase } = useChatStore(
    useShallow(selectChatInterfaceState),
  );
  const clearMessages = useChatStore((state) => state.clearMessages);
  const setIsSending = useChatStore((state) => state.setIsSending);
  const setThinkingStatus = useChatStore((state) => state.setThinkingStatus);
  const setTokenCounts = useChatStore((state) => state.setTokenCounts);
  const updateStreamTracking = useChatStore((state) => state.updateStreamTracking);
  const { config } = useAppConfigContext();

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
  const canStop = ACTIVE_STREAM_PHASES.has(streamPhase);
  const modelLabel = useMemo(() => {
    return config?.selected_model_id || 'ChatGPT 5.2 Thinking';
  }, [config?.selected_model_id]);

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
          <button type="button" className="chat-model-selector" aria-label="Model selector">
            <span>{modelLabel}</span>
            <ChevronDown size={14} />
          </button>
        </div>
        <div className="chat-meta">
          <TokenCountDisplay tokenCounts={tokenCounts} />
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
        </div>
      </header>

      {messages.length === 0 ? (
        <div className="chat-empty-state" data-testid="chat-empty-state">
          <h1 className="chat-empty-title">Good to see you, peter.</h1>
          <MessageInput
            onSendMessage={sendMessage}
            isSending={isSending}
            voiceModeEnabled={voiceModeEnabled}
            onStopResponse={handleStopQuery}
            isCentered
          />
        </div>
      ) : (
        <>
          <MessageList messages={messages} thinkingStatus={thinkingStatus} />
          <MessageInput
            onSendMessage={sendMessage}
            isSending={isSending}
            voiceModeEnabled={voiceModeEnabled}
            onStopResponse={handleStopQuery}
          />
        </>
      )}
    </div>
  );
}

export default ChatInterface;
