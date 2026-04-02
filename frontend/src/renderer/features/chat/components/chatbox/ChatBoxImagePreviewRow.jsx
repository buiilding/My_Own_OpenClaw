import PropTypes from 'prop-types';
import { FileText, X } from 'lucide-react';
import { resolveReadableFileTypeLabel } from '../../utils/composerAttachmentPresentation';

function ChatBoxImagePreviewRow({
  clipboardImages = [],
  readableFiles = [],
  onRemoveImage,
  onRemoveFile,
}) {
  const showPreviewRow = clipboardImages.length > 0 || readableFiles.length > 0;
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
            <X size={11} />
          </button>
        </div>
      ))}
      {readableFiles.map((file, index) => (
        <div className="chatbox-file-preview-card" key={file.id || `${file.filename}-${index}`}>
          <div className="chatbox-file-preview-icon" aria-hidden="true">
            <FileText size={14} />
          </div>
          <div className="chatbox-file-preview-meta">
            <span className="chatbox-file-preview-name" title={file.filename}>
              {file.filename}
            </span>
            <span className="chatbox-file-preview-type">
              {resolveReadableFileTypeLabel(file.filename)}
            </span>
          </div>
          <button
            type="button"
            className="chatbox-file-preview-remove"
            aria-label={`Remove attached file ${index + 1}`}
            onClick={() => onRemoveFile(file.id)}
          >
            <X size={11} />
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
  })),
  readableFiles: PropTypes.arrayOf(PropTypes.shape({
    id: PropTypes.string,
    filename: PropTypes.string,
    filePath: PropTypes.string,
  })),
  onRemoveImage: PropTypes.func.isRequired,
  onRemoveFile: PropTypes.func.isRequired,
};

export default ChatBoxImagePreviewRow;
