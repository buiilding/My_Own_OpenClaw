import PropTypes from 'prop-types';

export default function UserMessageEditComposer({
  value,
  onChange,
  onCancel,
  onSubmit,
  isSubmitting = false,
}) {
  return (
    <div className="user-message-editor" role="group" aria-label="Edit user message">
      <textarea
        className="user-message-editor-input"
        value={value}
        onChange={(event) => {
          if (!isSubmitting) {
            onChange(event.target.value);
          }
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey && !isSubmitting) {
            event.preventDefault();
            onSubmit();
          }
        }}
        disabled={isSubmitting}
        rows={3}
        autoFocus
      />
      <div className="user-message-editor-actions">
        <button
          type="button"
          className="user-message-editor-btn"
          onClick={onCancel}
          disabled={isSubmitting}
        >
          Cancel
        </button>
        <button
          type="button"
          className="user-message-editor-btn primary"
          onClick={onSubmit}
          disabled={isSubmitting}
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
  isSubmitting: PropTypes.bool,
};
