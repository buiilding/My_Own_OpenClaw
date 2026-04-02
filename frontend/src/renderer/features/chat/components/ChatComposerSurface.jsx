import {
  useCallback,
  useLayoutEffect,
  useRef,
} from 'react';
import PropTypes from 'prop-types';
import { FileText, X } from 'lucide-react';
import { useTextareaAutoResize } from '../hooks/useMessageInputUiBindings';
import { resolveReadableFileTypeLabel } from '../utils/composerAttachmentPresentation';

function assignRef(ref, value) {
  if (!ref) {
    return;
  }
  if (typeof ref === 'function') {
    ref(value);
    return;
  }
  ref.current = value;
}

function ChatComposerSurface({
  surfaceRef,
  textareaRef,
  attachmentInputRef,
  attachmentInputTestId = 'attachment-input',
  onAttachmentSelection,
  onSubmit,
  onMouseDown,
  onClickCapture,
  onMouseEnter,
  onMouseMove,
  onMouseLeave,
  inputValue,
  onInputChange,
  onPaste,
  onKeyDown,
  placeholder = 'Ask anything',
  inputId = 'chat-input',
  inputAriaLabel = 'Type your message',
  disabled = false,
  clipboardImages = [],
  readableFiles = [],
  onRemoveImage,
  onRemoveFile,
  leadingActions = null,
  trailingActions = null,
  surfaceClassName = '',
  formTestId = undefined,
  textareaClassName = '',
  onSurfaceHeightChange,
  maxTextareaHeight = 200,
  rows = 1,
}) {
  const internalSurfaceRef = useRef(null);
  const internalTextareaRef = useRef(null);
  const lastReportedHeightRef = useRef(null);

  const setSurfaceNode = useCallback((node) => {
    internalSurfaceRef.current = node;
    assignRef(surfaceRef, node);
  }, [surfaceRef]);

  const setTextareaNode = useCallback((node) => {
    internalTextareaRef.current = node;
    assignRef(textareaRef, node);
  }, [textareaRef]);

  const resizeTextarea = useCallback(() => {
    const textareaNode = internalTextareaRef.current;
    if (!textareaNode) {
      return;
    }
    textareaNode.style.height = 'auto';
    textareaNode.style.height = `${Math.min(textareaNode.scrollHeight, maxTextareaHeight)}px`;
  }, [maxTextareaHeight]);

  useTextareaAutoResize(inputValue, resizeTextarea);

  const reportSurfaceHeight = useCallback(() => {
    if (typeof onSurfaceHeightChange !== 'function') {
      return;
    }
    const surfaceNode = internalSurfaceRef.current;
    if (!surfaceNode) {
      return;
    }
    const rectHeight = Math.round(Number(surfaceNode.getBoundingClientRect?.().height) || 0);
    const offsetHeight = Math.round(Number(surfaceNode.offsetHeight) || 0);
    const nextHeight = Math.max(rectHeight, offsetHeight);
    if (nextHeight <= 0 || lastReportedHeightRef.current === nextHeight) {
      return;
    }
    lastReportedHeightRef.current = nextHeight;
    onSurfaceHeightChange(nextHeight);
  }, [onSurfaceHeightChange]);

  useLayoutEffect(() => {
    resizeTextarea();
    reportSurfaceHeight();

    if (typeof window !== 'undefined') {
      window.addEventListener('resize', reportSurfaceHeight);
    }

    let resizeObserver = null;
    if (typeof ResizeObserver === 'function') {
      resizeObserver = new ResizeObserver(() => {
        reportSurfaceHeight();
      });
      if (internalSurfaceRef.current) {
        resizeObserver.observe(internalSurfaceRef.current);
      }
      if (internalTextareaRef.current) {
        resizeObserver.observe(internalTextareaRef.current);
      }
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('resize', reportSurfaceHeight);
      }
      resizeObserver?.disconnect();
    };
  }, [
    clipboardImages.length,
    inputValue,
    readableFiles.length,
    reportSurfaceHeight,
    resizeTextarea,
  ]);

  return (
    <form
      ref={setSurfaceNode}
      onSubmit={onSubmit}
      onMouseDown={onMouseDown}
      onClickCapture={onClickCapture}
      onMouseEnter={onMouseEnter}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      className={`message-input-form chat-composer-surface${surfaceClassName ? ` ${surfaceClassName}` : ''}`}
      data-testid={formTestId}
    >
      {attachmentInputRef ? (
        <input
          ref={attachmentInputRef}
          type="file"
          multiple
          data-testid={attachmentInputTestId}
          style={{ display: 'none' }}
          onChange={onAttachmentSelection}
        />
      ) : null}

      {clipboardImages.length > 0 ? (
        <div className="message-image-preview-row">
          {clipboardImages.map((clipboardImage, index) => (
            <div className="message-image-preview-card" key={clipboardImage.id || index}>
              <img
                src={clipboardImage.previewUrl}
                alt={`Pasted image preview ${index + 1}`}
                className="message-image-preview-thumb"
              />
              <button
                type="button"
                className="message-image-preview-remove"
                aria-label={`Remove pasted image ${index + 1}`}
                onClick={() => onRemoveImage?.(clipboardImage.id)}
              >
                <X size={13} />
              </button>
            </div>
          ))}
        </div>
      ) : null}

      {readableFiles.length > 0 ? (
        <div className="message-file-preview-row">
          {readableFiles.map((file, index) => (
            <div className="message-file-preview-card" key={file.id || `${file.filename}-${index}`}>
              <div className="message-file-preview-icon" aria-hidden="true">
                <FileText size={16} />
              </div>
              <div className="message-file-preview-meta">
                <span className="message-file-preview-name" title={file.filename}>{file.filename}</span>
                <span className="message-file-preview-type">{resolveReadableFileTypeLabel(file.filename)}</span>
              </div>
              <button
                type="button"
                className="message-file-preview-remove"
                aria-label={`Remove attached file ${index + 1}`}
                onClick={() => onRemoveFile?.(file.id)}
              >
                <X size={13} />
              </button>
            </div>
          ))}
        </div>
      ) : null}

      <div className="message-input-row">
        <div className="message-input-left-actions">
          {leadingActions}
        </div>

        <label htmlFor={inputId} className="visually-hidden">Type your message</label>
        <textarea
          ref={setTextareaNode}
          id={inputId}
          value={inputValue}
          onChange={onInputChange}
          onPaste={onPaste}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          className={`message-input${textareaClassName ? ` ${textareaClassName}` : ''}`}
          rows={rows}
          style={{ minHeight: '24px', maxHeight: `${maxTextareaHeight}px` }}
          aria-label={inputAriaLabel}
        />

        <div className="message-input-right-actions">
          {trailingActions}
        </div>
      </div>
    </form>
  );
}

ChatComposerSurface.propTypes = {
  surfaceRef: PropTypes.oneOfType([
    PropTypes.func,
    PropTypes.shape({ current: PropTypes.any }),
  ]),
  textareaRef: PropTypes.oneOfType([
    PropTypes.func,
    PropTypes.shape({ current: PropTypes.any }),
  ]),
  attachmentInputRef: PropTypes.oneOfType([
    PropTypes.func,
    PropTypes.shape({ current: PropTypes.any }),
  ]),
  attachmentInputTestId: PropTypes.string,
  onAttachmentSelection: PropTypes.func,
  onSubmit: PropTypes.func,
  onMouseDown: PropTypes.func,
  onClickCapture: PropTypes.func,
  onMouseEnter: PropTypes.func,
  onMouseMove: PropTypes.func,
  onMouseLeave: PropTypes.func,
  inputValue: PropTypes.string.isRequired,
  onInputChange: PropTypes.func.isRequired,
  onPaste: PropTypes.func,
  onKeyDown: PropTypes.func,
  placeholder: PropTypes.string,
  inputId: PropTypes.string,
  inputAriaLabel: PropTypes.string,
  disabled: PropTypes.bool,
  clipboardImages: PropTypes.arrayOf(PropTypes.shape({
    id: PropTypes.string,
    previewUrl: PropTypes.string,
  })),
  readableFiles: PropTypes.arrayOf(PropTypes.shape({
    id: PropTypes.string,
    filename: PropTypes.string,
    filePath: PropTypes.string,
  })),
  onRemoveImage: PropTypes.func,
  onRemoveFile: PropTypes.func,
  leadingActions: PropTypes.node,
  trailingActions: PropTypes.node,
  surfaceClassName: PropTypes.string,
  formTestId: PropTypes.string,
  textareaClassName: PropTypes.string,
  onSurfaceHeightChange: PropTypes.func,
  maxTextareaHeight: PropTypes.number,
  rows: PropTypes.number,
};

export default ChatComposerSurface;
