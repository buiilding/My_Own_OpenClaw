import PropTypes from 'prop-types';

export default function UserMessageEditComposer({
  value,
  onChange,
  onCancel,
  onSubmit,
}) {
  return (
    <div className="user-message-editor" role="group" aria-label="Edit user message">
      <textarea
        className="user-message-editor-input"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            onSubmit();
          }
        }}
        rows={3}
        autoFocus
      />
      <div className="user-message-editor-actions">
        <button
          type="button"
          className="user-message-editor-btn"
          onClick={onCancel}
        >
          Cancel
        </button>
        <button
          type="button"
          className="user-message-editor-btn primary"
          onClick={onSubmit}
        >
          Send
        </button>
      </div>
    </div>
  );
}

UserMessageEditComposer.propTypes = {
  value: PropTypes.string.isRequired,
  onChange: PropTypes.func.isRequired,
  onCancel: PropTypes.func.isRequired,
  onSubmit: PropTypes.func.isRequired,
};
