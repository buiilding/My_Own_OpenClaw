import { useCallback } from 'react';
import MessageList from './MessageList';
import MessageInput from './MessageInput';
import TokenCountDisplay from './TokenCountDisplay';
import { useChatStore } from '../stores/chatStore';
import { useChatMessageSender } from '../hooks/useChatMessageSender';
import { useWakewordDetection } from '../../voice/hooks/useWakewordDetection';
import { ApiClient } from '../../../infrastructure/api/client';
import { useAppConfigContext } from '../../../app/providers/AppContextHooks';
import { PlayerService } from '../../../infrastructure/audio/PlayerService';
import { useEffect, useRef } from 'react';
import { IpcBridge, INVOKE_CHANNELS, ON_CHANNELS } from '../../../infrastructure/ipc/bridge';
import '../../../styles/ChatInterface.css';

/**
 * A clean and simple chat interface component.
 * Orchestrates the chat interaction using store and hooks.
 */
function ChatInterface() {
  const messages = useChatStore((state) => state.messages);
  const isSending = useChatStore((state) => state.isSending);
  const thinkingStatus = useChatStore((state) => state.thinkingStatus);
  const tokenCounts = useChatStore((state) => state.tokenCounts);
  // Use AppConfigContext directly for better performance
  // This avoids re-renders when saveStatus changes in AppStatusContext
  const { config, wakewordEnabled, setWakewordEnabled } = useAppConfigContext();
  
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
      if (data.type === 'audio-chunk' && audioPlayerRef.current) {
        audioPlayerRef.current.enqueueAudio(data.payload);
      }
    });
    return removeListener;
  }, []);

  const voiceModeEnabled = config?.voice_mode_enabled || false;
  const interactionMode = config?.interaction_mode || 'chat';
  const interactionModeLabel = interactionMode === 'agent' ? 'Agent' : 'Chat';
  const statusLabel = thinkingStatus
    ? 'Thinking...'
    : isSending
      ? 'Sending...'
      : 'Ready';

  const stopPlayback = useCallback(() => {
    audioPlayerRef.current?.stopPlayback();
  }, []);

  const { sendMessage } = useChatMessageSender(stopPlayback);

  const handleWakewordDetected = useCallback(() => {
    console.log('[ChatInterface] Wakeword detected!');
    setWakewordEnabled(false);
    ApiClient.wakewordDetected();
    IpcBridge.invoke(INVOKE_CHANNELS.SHOW_CHATBOX).catch((error) => {
      console.warn('[ChatInterface] Failed to show chatbox:', error);
    });
  }, [setWakewordEnabled]);

  useWakewordDetection(
    wakewordEnabled && !voiceModeEnabled,
    handleWakewordDetected
  );

  return (
    <div className="chat-container">
      <header className="chat-header">
        <div className="chat-title-block">
          <div className="chat-title">Conversation</div>
          <div className="chat-subtitle">{statusLabel}</div>
        </div>
        <div className="chat-meta">
          <div className={`chat-mode-badge chat-mode-${interactionMode}`}>
            Mode: {interactionModeLabel}
          </div>
          <TokenCountDisplay tokenCounts={tokenCounts} />
        </div>
      </header>
      <MessageList messages={messages} thinkingStatus={thinkingStatus} />
      <MessageInput 
        onSendMessage={sendMessage} 
        isSending={isSending} 
      />
    </div>
  );
}

export default ChatInterface;
