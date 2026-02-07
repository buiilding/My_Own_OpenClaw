import { useCallback, useEffect, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';
import MessageList from './MessageList';
import MessageInput from './MessageInput';
import TokenCountDisplay from './TokenCountDisplay';
import { useChatStore } from '../stores/chatStore';
import { useChatMessageSender } from '../hooks/useChatMessageSender';
import { useAppConfigContext } from '../../../app/providers/AppContextHooks';
import { PlayerService } from '../../../infrastructure/audio/PlayerService';
import { IpcBridge, ON_CHANNELS } from '../../../infrastructure/ipc/bridge';
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
  const interactionModeLabel = interactionMode === 'agent' ? 'Agent' : 'Chat';
  const statusLabel = thinkingStatus
    ? 'Thinking...'
    : isSending
      ? 'Sending...'
      : 'Ready';

  const stopPlayback = useCallback(() => {
    audioPlayerRef.current?.stopPlayback();
  }, []);

  const { sendMessage } = useChatMessageSender(stopPlayback, {
    returnToChatboxOnSend: true,
  });

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
