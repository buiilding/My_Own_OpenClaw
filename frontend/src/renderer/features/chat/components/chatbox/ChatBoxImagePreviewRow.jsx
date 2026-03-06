import PropTypes from 'prop-types';

function ChatBoxImagePreviewRow({ clipboardImages, onRemoveImage }) {
  const showPreviewRow = clipboardImages.length > 0;
  return (
    <div
      className={`chatbox-image-preview-row${showPreviewRow ? ' has-items' : ''}`}
      aria-hidden={!showPreviewRow}
    >
      {clipboardImages.map((clipboardImage, index) => (
        <div className="chatbox-image-preview-card" key={clipboardImage.id || index}>
          <img
            src={clipboardImage.previewUrl}
            alt={`Pasted image preview ${index + 1}`}
            className="chatbox-image-preview-thumb"
          />
          <button
            type="button"
            className="chatbox-image-preview-remove"
            aria-label={`Remove screenshot ${index + 1}`}
            onClick={() => onRemoveImage(clipboardImage.id)}
          >
            x
          </button>
        </div>
      ))}
    </div>
  );
}

ChatBoxImagePreviewRow.propTypes = {
  clipboardImages: PropTypes.arrayOf(PropTypes.shape({
    id: PropTypes.string,
    previewUrl: PropTypes.string,
  })).isRequired,
  onRemoveImage: PropTypes.func.isRequired,
};

export default ChatBoxImagePreviewRow;
