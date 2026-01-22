import { useCallback } from 'react';
import MessageList from './chat/MessageList';
import MessageInput from './chat/MessageInput';
import TokenCountDisplay from './TokenCountDisplay';
import { useChatContext } from '../context/ChatContext';
import { useAppContext } from '../context/AppContext';
import { useWakewordDetection } from '../hooks/useWakewordDetection';
import { ApiClient } from '../api/client';
import '../styles/ChatInterface.css';

/**
 * A clean and simple chat interface component.
 * Orchestrates the chat interaction using context and smaller sub-components.
 */
function ChatInterface() {
  const { messages, isSending, thinkingStatus, tokenCounts, sendMessage } = useChatContext();
  const { config, wakewordEnabled, updateConfig } = useAppContext();

  const voiceModeEnabled = config?.voice_mode_enabled || false;

  const handleWakewordDetected = useCallback(() => {
    console.log('[ChatInterface] Wakeword detected!');
    // Enable voice mode
    if (config) {
      updateConfig({ ...config, voice_mode_enabled: true });
    }
    ApiClient.wakewordDetected();
  }, [config, updateConfig]);

  useWakewordDetection(
    wakewordEnabled && !voiceModeEnabled,
    handleWakewordDetected
  );

  return (
    <div className="chat-container">
      <MessageList messages={messages} thinkingStatus={thinkingStatus} />
      <MessageInput 
        onSendMessage={sendMessage} 
        isSending={isSending} 
        voiceModeEnabled={voiceModeEnabled} 
      />
      <TokenCountDisplay tokenCounts={tokenCounts} />
    </div>
  );
}

export default ChatInterface;
