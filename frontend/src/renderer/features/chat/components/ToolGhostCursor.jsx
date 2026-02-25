function ToolGhostCursor({ label }) {
  return (
    <div className="chatbox-tool-ghost-cursor-wrap" aria-hidden="true">
      <div className="chatbox-tool-ghost-ring" />
      <div className="chatbox-tool-ghost-cursor">
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <polyline
            points="4 4 20 12 13 13 12 20 4 4"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <line
            x1="9"
            y1="9"
            x2="13"
            y2="13"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <div className="chatbox-tool-ghost-label">{label}</div>
    </div>
  );
}

export default ToolGhostCursor;
