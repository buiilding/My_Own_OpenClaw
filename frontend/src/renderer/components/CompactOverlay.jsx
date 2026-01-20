import '../styles/CompactOverlay.css';

function CompactOverlay({ toolCalls, thinkingStatus }) {
  console.log('[CompactOverlay] Rendering with', toolCalls.length, 'tool calls');
  
  return (
    <div className="compact-overlay">
      <div className="overlay-header">
        <span>Agent Activity</span>
        <span className="mode-indicator">AGENT MODE</span>
      </div>
      <div className="activity-list">
        {toolCalls.length === 0 && !thinkingStatus && (
          <div className="activity-item">
            <div className="activity-icon">⏳</div>
            <div className="activity-content">
              <div className="activity-name">Waiting for agent activity...</div>
              <div className="activity-explanation">
                The agent is processing your request. Tool calls and explanations will appear here.
              </div>
            </div>
          </div>
        )}
        {toolCalls.map(call => (
          <div key={call.id} className="activity-item">
            <div className="activity-icon">🔧</div>
            <div className="activity-content">
              <div className="activity-name">{call.toolName}</div>
              <div className="activity-explanation">
                {call.explanation || call.toolName}
              </div>
            </div>
          </div>
        ))}
        {thinkingStatus && (
          <div className="thinking-status">
            <div className="thinking-icon">💭</div>
            <div className="thinking-text">{thinkingStatus}</div>
          </div>
        )}
      </div>
    </div>
  );
}

export default CompactOverlay;
