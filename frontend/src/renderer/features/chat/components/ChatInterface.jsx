import { useCallback, useEffect, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';
import MessageList from './MessageList';
import MessageInput from './MessageInput';
import TokenCountDisplay from './TokenCountDisplay';
import { useChatStore } from '../stores/chatStore';
import { useChatMessageSender } from '../hooks/useChatMessageSender';
import { useAppConfigContext } from '../../../app/providers/AppContextHooks';
import { PlayerService } from '../../../infrastructure/audio/PlayerService';
import { IpcBridge, INVOKE_CHANNELS, ON_CHANNELS } from '../../../infrastructure/ipc/bridge';
import { extractAudioChunkPayload } from '../utils/backendAudioEvents';
import { selectChatInterfaceState } from '../utils/chatSelectors';
import '../../../styles/ChatInterface.css';

/**
 * A clean and simple chat interface component.
 * Orchestrates the chat interaction using store and hooks.
 */
function ChatInterface() {
  const { messages, isSending, thinkingStatus, tokenCounts } = useChatStore(
    useShallow(selectChatInterfaceState),
  );
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

  const { sendMessage } = useChatMessageSender(stopPlayback, {
    returnToChatboxOnSend: true,
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
              className="chat-window-control-btn"
              onClick={handleWindowMinimize}
              aria-label="Minimize window"
              title="Minimize"
            >
              <span className="chat-window-control-icon">-</span>
            </button>
            <button
              type="button"
              className="chat-window-control-btn"
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
