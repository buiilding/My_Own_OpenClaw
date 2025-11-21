import { useState, useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import '../styles/OverlayLayout.css';
import ThinkingDisplay from './ThinkingDisplay';

/**
 * Desktop overlay layout with history box and input box.
 * Matches the exact HTML design with emerald/mint color scheme.
 */
function OverlayLayout({ messages, onSendMessage, isSending, thinkingStatus, config, availableModels, onConfigChange }) {
    const [inputValue, setInputValue] = useState('');
    const [haloVisible, setHaloVisible] = useState(false); // Start with halo OFF
    const [micActive, setMicActive] = useState(false);
    const [isCollapsed, setIsCollapsed] = useState(false); // Collapsed state
    const [isVoiceMode, setIsVoiceMode] = useState(false); // Voice mode state
    const [activeQuery, setActiveQuery] = useState(null); // Track submitted query
    const [firstQuery, setFirstQuery] = useState(null); // Track ONLY the first query for title
    const inputRef = useRef(null);
    const messagesContainerRef = useRef(null);

    // Listen for toggle-collapse event from main process
    useEffect(() => {
        if (window.ipc) {
            const cleanup = window.ipc.on('toggle-collapse', () => {
                setIsCollapsed(prev => !prev);
            });
            return cleanup;
        }
    }, []);

    // Listen for toggle-voice-mode event from main process
    useEffect(() => {
        if (window.ipc) {
            const cleanup = window.ipc.on('toggle-voice-mode', () => {
                setIsVoiceMode(prev => !prev);
            });
            return cleanup;
        }
    }, []);

    // Auto-scroll to bottom when new messages arrive
    useEffect(() => {
        if (messagesContainerRef.current) {
            messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
        }
    }, [messages, thinkingStatus]);

    // Turn halo ON during sending, OFF when done
    useEffect(() => {
        if (isSending) {
            setHaloVisible(true);
        } else {
            setHaloVisible(false);
        }
    }, [isSending]);

    const handleSendMessage = () => {
        const message = inputValue.trim();
        if (!message || isSending) return;

        // Set the active query to display in top box
        setActiveQuery(message);

        // Set first query ONLY if it hasn't been set yet (this is the first message)
        if (!firstQuery) {
            setFirstQuery(message);
        }

        onSendMessage(message);
        setInputValue('');
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !isSending) {
            handleSendMessage();
        }
    };

    const toggleMic = () => {
        setIsVoiceMode(!isVoiceMode);
    };

    // Helper function to create a title from the query
    const formatQueryAsTitle = (query) => {
        // Just capitalize the first letter of the query
        return query.charAt(0).toUpperCase() + query.slice(1);
    };

    // Get all available models (online + local)
    const getAllModels = () => {
        if (!availableModels) return [];
        const online = availableModels.online || [];
        const local = availableModels.local || [];
        return [...online, ...local];
    };

    // Handle model selection change
    const handleModelChange = (e) => {
        const selectedModelId = e.target.value;
        if (!config || !onConfigChange) return;

        // Find the selected model to get its provider
        const allModels = getAllModels();
        const selectedModel = allModels.find(m => m.id === selectedModelId);

        if (selectedModel) {
            const updatedConfig = {
                ...config,
                selected_model_id: selectedModelId,
                model_provider: selectedModel.provider,
            };
            onConfigChange(updatedConfig);
        }
    };

    // Get current selected model display name
    const getSelectedModelDisplay = () => {
        if (!config?.selected_model_id) return 'Select Model';
        const allModels = getAllModels();
        const model = allModels.find(m => m.id === config.selected_model_id);
        return model ? model.display_name.split('/').pop() : 'Select Model';
    };

    return (
        <div className="overlay-container">
            {/* Top Input Box (Always Visible) */}
            <div className={`overlay-box ${haloVisible ? '' : 'halo-off'} ${isCollapsed ? 'collapsed' : ''} ${activeQuery ? 'compact' : ''}`}>
                {isCollapsed ? (
                    /* Microphone Button in Collapsed State */
                    <button
                        className={`mic-btn collapsed-mic ${isVoiceMode ? 'voice-mode' : ''}`}
                        onClick={toggleMic}
                        title="Toggle Voice Mode"
                    >
                        <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                            <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
                            <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
                        </svg>
                    </button>
                ) : activeQuery ? (
                    /* Compact view - just the query text, no buttons */
                    <div className="overlay-box-inner compact">
                        <div className="content">
                            <input
                                type="text"
                                className="typing-input"
                                value={formatQueryAsTitle(firstQuery)}
                                disabled
                                readOnly
                            />
                        </div>
                    </div>
                ) : (
                    <div className="overlay-box-inner">
                        {/* Microphone Button */}
                        <button
                            className={`mic-btn ${isVoiceMode ? 'voice-mode' : ''}`}
                            onClick={toggleMic}
                            title="Toggle Voice Mode"
                        >
                            <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
                                <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
                            </svg>
                        </button>

                        {/* Model Selector Dropdown */}
                        <select
                            className="model-selector"
                            value={config?.selected_model_id || ''}
                            onChange={handleModelChange}
                            disabled={isSending}
                            title="Select AI Model"
                        >
                            <option value="" disabled>Select Model</option>
                            {getAllModels().map((model) => (
                                <option key={model.id} value={model.id}>
                                    {model.display_name.split('/').pop()}
                                </option>
                            ))}
                        </select>

                        {/* Send Button */}
                        <button
                            className="send-btn"
                            onClick={handleSendMessage}
                            disabled={isSending || !inputValue.trim()}
                            title="Send message"
                        >
                            <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                <path d="M12 20V4M5 11l7-7 7 7" />
                            </svg>
                        </button>

                        {/* Content Area with Input */}
                        <div className="content">
                            <input
                                type="text"
                                className="typing-input"
                                ref={inputRef}
                                value={inputValue}
                                onChange={(e) => setInputValue(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder="Hello! How can I help you today?"
                                disabled={isSending}
                            />
                        </div>
                    </div>
                )}
            </div>

            {/* History Box (Below Top Box) - Only show if there are messages and not collapsed */}
            {!isCollapsed && messages && messages.length > 0 && (
                <div className="history-box visible">
                    <div className="messages-container" ref={messagesContainerRef}>
                        {messages.map((message, index) => (
                            <div key={index} className={`message ${message.sender}`}>
                                <div className="message-bubble">
                                    {message.text}
                                </div>
                            </div>
                        ))}
                        {thinkingStatus && <ThinkingDisplay status={thinkingStatus} />}
                    </div>
                </div>
            )}

            {/* Bottom Input Box (Conversation) - Only show when conversation started */}
            {!isCollapsed && activeQuery && (
                <div className={`overlay-box conversation-box ${haloVisible ? '' : 'halo-off'}`}>
                    <div className="overlay-box-inner">
                        {/* Microphone Button */}
                        <button
                            className={`mic-btn ${isVoiceMode ? 'voice-mode' : ''}`}
                            onClick={toggleMic}
                            title="Toggle Voice Mode"
                        >
                            <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
                                <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
                            </svg>
                        </button>

                        {/* Model Selector Dropdown */}
                        <select
                            className="model-selector"
                            value={config?.selected_model_id || ''}
                            onChange={handleModelChange}
                            disabled={isSending}
                            title="Select AI Model"
                        >
                            <option value="" disabled>Select Model</option>
                            {getAllModels().map((model) => (
                                <option key={model.id} value={model.id}>
                                    {model.display_name.split('/').pop()}
                                </option>
                            ))}
                        </select>

                        {/* Send Button */}
                        <button
                            className="send-btn"
                            onClick={handleSendMessage}
                            disabled={isSending || !inputValue.trim()}
                            title="Send message"
                        >
                            <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                <path d="M12 20V4M5 11l7-7 7 7" />
                            </svg>
                        </button>

                        {/* Content Area with Input */}
                        <div className="content">
                            <input
                                type="text"
                                className="typing-input"
                                ref={inputRef}
                                value={inputValue}
                                onChange={(e) => setInputValue(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder="Continue the conversation..."
                                disabled={isSending}
                            />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

OverlayLayout.propTypes = {
    messages: PropTypes.array,
    onSendMessage: PropTypes.func.isRequired,
    isSending: PropTypes.bool,
    thinkingStatus: PropTypes.string,
    config: PropTypes.object,
    availableModels: PropTypes.object,
    onConfigChange: PropTypes.func
};

OverlayLayout.defaultProps = {
    messages: [],
    isSending: false,
    thinkingStatus: null
};

export default OverlayLayout;
