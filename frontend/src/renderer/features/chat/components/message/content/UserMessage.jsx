import { useCallback, useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import {
  resolveMessageScreenshotSrcList,
} from '../../../utils/message/messageScreenshots';
import { IpcBridge, INVOKE_CHANNELS } from '../../../../../infrastructure/ipc/bridge';
import MarkdownMessage from './MarkdownMessage';

const CLOSED_IMAGE_CONTEXT_MENU = Object.freeze({
  open: false,
  x: 0,
  y: 0,
  src: null,
  isCopying: false,
});

function resolveImageContextMenuPosition(x, y) {
  const viewportWidth = typeof window === 'undefined' ? 0 : window.innerWidth;
  const viewportHeight = typeof window === 'undefined' ? 0 : window.innerHeight;
  const menuWidth = 216;
  const menuHeight = 60;
  const edgePadding = 8;

  const clampedX = viewportWidth > 0
    ? Math.max(edgePadding, Math.min(x, viewportWidth - menuWidth - edgePadding))
    : x;
  const clampedY = viewportHeight > 0
    ? Math.max(edgePadding, Math.min(y, viewportHeight - menuHeight - edgePadding))
    : y;

  return {
    left: clampedX,
    top: clampedY,
  };
}

export default function UserMessage({ message }) {
  const screenshotSources = resolveMessageScreenshotSrcList(message);
  const attachmentFilenames = Array.isArray(message.attachmentFilenames)
    ? message.attachmentFilenames.filter((filename) => typeof filename === 'string' && filename.length > 0)
    : [];
  const [imageContextMenu, setImageContextMenu] = useState(CLOSED_IMAGE_CONTEXT_MENU);
  const imageContextMenuRef = useRef(null);

  const closeImageContextMenu = useCallback(() => {
    setImageContextMenu((currentState) => (currentState.open ? CLOSED_IMAGE_CONTEXT_MENU : currentState));
  }, []);

  useEffect(() => {
    if (!imageContextMenu.open) {
      return undefined;
    }

    const handlePointerDown = (event) => {
      if (imageContextMenuRef.current?.contains(event.target)) {
        return;
      }
      closeImageContextMenu();
    };

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        closeImageContextMenu();
      }
    };

    window.addEventListener('mousedown', handlePointerDown, true);
    window.addEventListener('scroll', closeImageContextMenu, true);
    window.addEventListener('resize', closeImageContextMenu);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('mousedown', handlePointerDown, true);
      window.removeEventListener('scroll', closeImageContextMenu, true);
      window.removeEventListener('resize', closeImageContextMenu);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [closeImageContextMenu, imageContextMenu.open]);

  const handleScreenshotContextMenu = useCallback((event, screenshotSrc) => {
    if (typeof screenshotSrc !== 'string' || screenshotSrc.trim().length === 0) {
      return;
    }

    event.preventDefault();
    const imageBounds = event.currentTarget?.getBoundingClientRect?.();
    const anchorX = imageBounds
      ? (imageBounds.right - 16)
      : event.clientX;
    const anchorY = imageBounds
      ? (imageBounds.top + 12)
      : event.clientY;
    setImageContextMenu({
      open: true,
      x: anchorX,
      y: anchorY,
      src: screenshotSrc,
      isCopying: false,
    });
  }, []);

  const handleCopyImage = useCallback(async () => {
    const imageSrc = imageContextMenu.src;
    if (typeof imageSrc !== 'string' || imageSrc.trim().length === 0) {
      closeImageContextMenu();
      return;
    }

    setImageContextMenu((currentState) => (
      currentState.open
        ? { ...currentState, isCopying: true }
        : currentState
    ));

    try {
      const copyResult = await IpcBridge.invoke(INVOKE_CHANNELS.COPY_IMAGE_TO_CLIPBOARD, {
        src: imageSrc,
      });
      if (!copyResult?.success) {
        throw new Error(copyResult?.error || 'Clipboard image copy failed.');
      }
    } catch (error) {
      console.warn('[UserMessage] Failed to copy image to clipboard:', error);
    } finally {
      closeImageContextMenu();
    }
  }, [closeImageContextMenu, imageContextMenu.src]);

  const imageContextMenuPosition = resolveImageContextMenuPosition(
    imageContextMenu.x,
    imageContextMenu.y,
  );

  return (
    <div className="user-message-container">
      {attachmentFilenames.length > 0 ? (
        <div className="user-file-attachments">
          {attachmentFilenames.map((filename, index) => (
            <span className="user-file-attachment-pill" key={`${filename}-${index}`}>
              {filename}
            </span>
          ))}
        </div>
      ) : null}
      {screenshotSources.length > 0 ? (
        <div className="user-screenshot-gallery">
          {screenshotSources.map((screenshotSrc, index) => (
            <div className="user-screenshot-container" key={`${screenshotSrc}-${index}`}>
              <img
                src={screenshotSrc}
                alt={screenshotSources.length > 1 ? `User message screenshot ${index + 1}` : 'User message screenshot'}
                className="user-screenshot-image"
                loading="lazy"
                onContextMenu={(event) => handleScreenshotContextMenu(event, screenshotSrc)}
              />
            </div>
          ))}
        </div>
      ) : null}
      <MarkdownMessage text={message.text} sender="user" />
      {imageContextMenu.open ? (
        <div
          ref={imageContextMenuRef}
          className="message-dropdown-menu user-image-context-menu"
          role="menu"
          style={imageContextMenuPosition}
        >
          <button
            type="button"
            className="message-dropdown-item"
            role="menuitem"
            onClick={() => {
              void handleCopyImage();
            }}
            disabled={imageContextMenu.isCopying}
          >
            <span>{imageContextMenu.isCopying ? 'Copying image...' : 'Copy image'}</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}

UserMessage.propTypes = {
  message: PropTypes.shape({
    text: PropTypes.string.isRequired,
    attachmentFilenames: PropTypes.arrayOf(PropTypes.string),
    screenshot: PropTypes.string,
    screenshotUrl: PropTypes.string,
    screenshotContentType: PropTypes.string,
    screenshots: PropTypes.arrayOf(PropTypes.shape({
      screenshot: PropTypes.string,
      screenshotRef: PropTypes.string,
      screenshotUrl: PropTypes.string,
      screenshotContentType: PropTypes.string,
    })),
  }).isRequired,
};
