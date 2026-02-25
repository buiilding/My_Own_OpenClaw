import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { ChevronDown, Sparkles, Volume2 } from 'lucide-react';
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
import '../../../styles/ChatInterface.css';

const ACTIVE_STREAM_PHASES = new Set(['awaiting-first-chunk', 'streaming', 'tool-call', 'tool-output']);
const DEFAULT_MODEL_OPTIONS = ['ChatGPT 5.2 Thinking', 'ChatGPT 4o', 'ChatGPT 4o mini'];

function ChatGptLogo({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M2 17L12 22L22 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M2 12L12 17L22 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ChatInterface({ sidebarOpen = true }) {
  const { messages, isSending, thinkingStatus, streamPhase } = useChatStore(
    useShallow(selectChatInterfaceState),
  );
  const clearMessages = useChatStore((state) => state.clearMessages);
  const setIsSending = useChatStore((state) => state.setIsSending);
  const setThinkingStatus = useChatStore((state) => state.setThinkingStatus);
  const setTokenCounts = useChatStore((state) => state.setTokenCounts);
  const updateStreamTracking = useChatStore((state) => state.updateStreamTracking);
  const { config, updateConfig } = useAppConfigContext();

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
  const configuredModelId = config?.selected_model_id || '';
  const modelOptions = useMemo(() => {
    if (!configuredModelId) {
      return DEFAULT_MODEL_OPTIONS;
    }
    if (DEFAULT_MODEL_OPTIONS.includes(configuredModelId)) {
      return DEFAULT_MODEL_OPTIONS;
    }
    return [configuredModelId, ...DEFAULT_MODEL_OPTIONS];
  }, [configuredModelId]);
  const [modelLabel, setModelLabel] = useState(() => modelOptions[0]);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const modelMenuRef = useRef(null);

  useEffect(() => {
    setModelLabel(modelOptions[0]);
  }, [modelOptions]);

  useEffect(() => {
    const handlePointerDown = (event) => {
      if (!modelMenuRef.current) {
        return;
      }
      if (!modelMenuRef.current.contains(event.target)) {
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

  const handleToggleSpeechMode = useCallback(() => {
    if (typeof updateConfig !== 'function') {
      return;
    }
    updateConfig({
      speech_mode_enabled: !speechModeEnabled,
    });
  }, [speechModeEnabled, updateConfig]);

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
            {!sidebarOpen ? (
              <div className="chat-header-brand-dot" aria-hidden="true">
                <ChatGptLogo size={14} />
              </div>
            ) : null}
            <div className="chat-model-dropdown" ref={modelMenuRef}>
              <button
                type="button"
                className="chat-model-selector"
                aria-label="Model selector"
                aria-expanded={modelMenuOpen}
                onClick={() => {
                  setModelMenuOpen((current) => !current);
                }}
              >
                <span>{modelLabel}</span>
                <ChevronDown size={14} />
              </button>
              {modelMenuOpen ? (
                <div className="chat-model-menu" role="menu">
                  {modelOptions.map((option) => (
                    <button
                      key={option}
                      type="button"
                      className="chat-model-menu-item"
                      role="menuitem"
                      onClick={() => {
                        setModelLabel(option);
                        setModelMenuOpen(false);
                      }}
                    >
                      <Sparkles size={16} />
                      <span>{option}</span>
                    </button>
                  ))}
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
