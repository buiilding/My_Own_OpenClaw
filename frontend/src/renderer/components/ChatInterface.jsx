import { useState, useEffect, useRef, useCallback } from 'react';
import PropTypes from 'prop-types';
import ThinkingDisplay from './ThinkingDisplay';
import { useVoiceMode } from '../hooks/useVoiceMode';
import '../styles/ThinkingDisplay.css';

/**
 * A clean and simple chat interface component.
 * It displays messages and provides an input field for sending new ones.
 *
 * @param {object} props - The component's props.
 * @param {Array<object>} props.messages - An array of message objects to display.
 * @param {Function} props.onSendMessage - A callback function to be invoked when a message is sent.
 * @param {boolean} props.isSending - A flag to indicate if a message is currently being sent.
 * @param {string|null} props.thinkingStatus - The current status message from the agent.
 * @param {boolean} props.voiceModeEnabled - Whether voice mode is enabled.
 */
function ChatInterface({
  messages,
  onSendMessage,
  isSending = false,
  thinkingStatus,
  voiceModeEnabled = false,
}) {
  const [inputValue, setInputValue] = useState('');
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const inputValueRef = useRef('');
  
  // Track transcription region boundaries for chunk replacement
  const transcriptionStartRef = useRef(0);
  const transcriptionEndRef = useRef(0);
  const hasTranscriptionRef = useRef(false);

  // Keep inputValueRef in sync with inputValue
  useEffect(() => {
    inputValueRef.current = inputValue;
  }, [inputValue]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, thinkingStatus]);

  // Handle transcription updates from voice mode
  const handleTranscriptionUpdate = useCallback((transcriptionText, isFinal) => {
    if (!transcriptionText) return;

    setInputValue((currentValue) => {
      // If we have an existing transcription region, replace it
      if (hasTranscriptionRef.current) {
        const before = currentValue.substring(0, transcriptionStartRef.current);
        const after = currentValue.substring(transcriptionEndRef.current);
        const newValue = before + transcriptionText + after;
        
        // Update transcription boundaries
        transcriptionStartRef.current = before.length;
        transcriptionEndRef.current = transcriptionStartRef.current + transcriptionText.length;
        
        return newValue;
      } else {
        // No existing transcription, append at end
        const newValue = currentValue + transcriptionText;
        transcriptionStartRef.current = currentValue.length;
        transcriptionEndRef.current = newValue.length;
        hasTranscriptionRef.current = true;
        return newValue;
      }
    });
  }, []);

  // Handle utterance end (silence detected) - auto-send
  const handleUtteranceEnd = useCallback(() => {
    const currentValue = inputValueRef.current;
    if (currentValue.trim() && !isSending) {
      onSendMessage(currentValue.trim());
      setInputValue('');
      // Reset transcription state
      transcriptionStartRef.current = 0;
      transcriptionEndRef.current = 0;
      hasTranscriptionRef.current = false;
    }
  }, [isSending, onSendMessage]);

  // Initialize voice mode hook
  const voiceMode = useVoiceMode(
    voiceModeEnabled,
    handleTranscriptionUpdate,
    handleUtteranceEnd
  );

  // Reset transcription state when voice mode is disabled
  useEffect(() => {
    if (!voiceModeEnabled) {
      transcriptionStartRef.current = 0;
      transcriptionEndRef.current = 0;
      hasTranscriptionRef.current = false;
    }
  }, [voiceModeEnabled]);

  const handleInputChange = useCallback((e) => {
    const newValue = e.target.value;
    const cursorPosition = e.target.selectionStart;
    
    setInputValue((oldValue) => {
      // If user is typing/pasting, update transcription boundaries
      // If cursor is before transcription start, transcription moves forward
      // If cursor is within transcription, split it
      // If cursor is after transcription end, keep boundaries
      if (hasTranscriptionRef.current) {
        const oldLength = oldValue.length;
        const newLength = newValue.length;
        const diff = newLength - oldLength;
        
        if (cursorPosition <= transcriptionStartRef.current) {
          // User typed before transcription - shift transcription forward
          transcriptionStartRef.current += diff;
          transcriptionEndRef.current += diff;
        } else if (cursorPosition >= transcriptionEndRef.current) {
          // User typed after transcription - keep boundaries
          // No change needed
        } else {
          // User typed within transcription - invalidate transcription region
          // We'll treat this as user editing, so clear transcription tracking
          hasTranscriptionRef.current = false;
          transcriptionStartRef.current = 0;
          transcriptionEndRef.current = 0;
        }
      }
      
      return newValue;
    });
  }, []);

  // Handle clipboard paste
  const handlePaste = useCallback((e) => {
    const pastedText = e.clipboardData.getData('text');
    if (!pastedText) return;

    const input = e.target;
    const cursorPosition = input.selectionStart;
    
    setInputValue((currentValue) => {
      // Insert pasted text at cursor position
      const before = currentValue.substring(0, cursorPosition);
      const after = currentValue.substring(input.selectionEnd || cursorPosition);
      const newValue = before + pastedText + after;
      
      // Update transcription boundaries based on paste position
      if (hasTranscriptionRef.current) {
        if (cursorPosition <= transcriptionStartRef.current) {
          // Paste before transcription - shift transcription forward
          transcriptionStartRef.current += pastedText.length;
          transcriptionEndRef.current += pastedText.length;
        } else if (cursorPosition >= transcriptionEndRef.current) {
          // Paste after transcription - keep boundaries
          // No change needed
        } else {
          // Paste within transcription - split transcription region
          // For simplicity, invalidate transcription tracking when pasting within it
          hasTranscriptionRef.current = false;
          transcriptionStartRef.current = 0;
          transcriptionEndRef.current = 0;
        }
      }
      
      // Set cursor position after pasted text
      setTimeout(() => {
        const newCursorPosition = cursorPosition + pastedText.length;
        input.setSelectionRange(newCursorPosition, newCursorPosition);
      }, 0);
      
      return newValue;
    });
    
    e.preventDefault();
  }, []);

  const handleSubmit = useCallback(
    (e) => {
      e.preventDefault();
      if (inputValue.trim() && !isSending) {
        onSendMessage(inputValue.trim());
        setInputValue('');
        // Reset transcription state
        transcriptionStartRef.current = 0;
        transcriptionEndRef.current = 0;
        hasTranscriptionRef.current = false;
      }
    },
    [inputValue, isSending, onSendMessage]
  );

  const renderMessageContent = (msg) => {
    // Determine if message is a tool output (function result)
    const isToolOutput = msg.type === 'tool-output';
    const isToolCall = msg.type === 'tool-call';
    const isError = msg.type === 'error';
    const isLlmText = msg.type === 'llm-text' || !msg.type; // default to text

    if (isError) {
      return (
        <div className="error-message-container" style={{
          backgroundColor: '#fee2e2',
          border: '1px solid #fca5a5',
          borderRadius: '8px',
          padding: '12px',
          color: '#991b1b'
        }}>
          <div className="error-header" style={{ fontWeight: 'bold', marginBottom: '4px' }}>⚠️ Error</div>
          <div className="error-content">{msg.text}</div>
        </div>
      );
    }

    if (isToolOutput) {
      return (
        <div className="tool-output-container">
          <div className="tool-output-header">📤 Tool Output</div>
          <pre className="tool-output-content">{msg.text}</pre>
          {msg.screenshot && (
            <div className="tool-screenshot-container">
              <div className="tool-screenshot-header">📸 Screenshot After Action</div>
              <img
                src={`data:image/png;base64,${msg.screenshot}`}
                alt="Screenshot after tool execution"
                className="tool-screenshot-image"
                style={{ maxWidth: '100%', maxHeight: '400px', border: '1px solid #ccc', borderRadius: '4px' }}
              />
            </div>
          )}
        </div>
      );
    }

    if (isToolCall) {
      return (
        <div className="tool-call-container">
          <div className="tool-call-header">🔧 Tool Call</div>
          <pre className="tool-call-content">{msg.text}</pre>
        </div>
      );
    }

    return <div className="message-content">{msg.text}</div>;
  };

  return (
    <div className="chat-container">
      <div className="message-list">
        {messages.map((msg) => {
          const messageClass = `message message-${msg.sender} ${
            msg.sender === 'assistant' && msg.isComplete === false ? 'message-streaming' : ''
          } ${msg.type ? `message-type-${msg.type}` : ''}`;
          return (
            <div key={msg.id} className={messageClass}>
              {renderMessageContent(msg)}
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>
      <ThinkingDisplay status={thinkingStatus} />
      {voiceModeEnabled && voiceMode.error && (
        <div className="voice-mode-error" style={{
          backgroundColor: '#fee2e2',
          border: '1px solid #fca5a5',
          borderRadius: '4px',
          padding: '8px 12px',
          marginBottom: '8px',
          color: '#991b1b',
          fontSize: '14px'
        }}>
          ⚠️ Voice Mode Error: {voiceMode.error}
        </div>
      )}
      {voiceModeEnabled && voiceMode.isRecording && (
        <div className="voice-mode-indicator" style={{
          backgroundColor: '#dbeafe',
          border: '1px solid #93c5fd',
          borderRadius: '4px',
          padding: '8px 12px',
          marginBottom: '8px',
          color: '#1e40af',
          fontSize: '14px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <span style={{ fontSize: '16px' }}>🎤</span>
          <span>Voice mode active - {voiceMode.isConnected ? 'Listening...' : 'Connecting...'}</span>
        </div>
      )}
      <form onSubmit={handleSubmit} className="message-input-form">
        <label htmlFor="chat-input" className="visually-hidden">
          Type your message
        </label>
        <input
          ref={inputRef}
          id="chat-input"
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onPaste={handlePaste}
          placeholder={voiceModeEnabled ? "Type your message or speak..." : "Type your message..."}
          disabled={isSending}
          className="message-input"
        />
        <button type="submit" disabled={isSending} className="send-button">
          {isSending ? '...' : 'Send'}
        </button>
      </form>
    </div>
  );
}

ChatInterface.propTypes = {
  messages: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string.isRequired,
      text: PropTypes.string.isRequired,
      sender: PropTypes.oneOf(['user', 'assistant']).isRequired,
      isComplete: PropTypes.bool,
    })
  ).isRequired,
  onSendMessage: PropTypes.func.isRequired,
  isSending: PropTypes.bool,
  thinkingStatus: PropTypes.oneOfType([
    PropTypes.string,
    PropTypes.oneOf([null]),
  ]),
  voiceModeEnabled: PropTypes.bool,
};

export default ChatInterface;
