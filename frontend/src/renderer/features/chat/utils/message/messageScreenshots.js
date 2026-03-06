import { normalizeArtifactImageContentType } from '../../../../infrastructure/services/ArtifactImageUtils';
import { buildArtifactUrl } from '../../../../infrastructure/services/ArtifactUploader';

function resolveAttachmentSrc(attachment) {
  if (!attachment || typeof attachment !== 'object') {
    return null;
  }
  if (attachment.screenshotUrl) {
    return attachment.screenshotUrl;
  }
  if (attachment.screenshotRef) {
    return buildArtifactUrl(attachment.screenshotRef);
  }
  if (attachment.screenshot) {
    const contentType = normalizeArtifactImageContentType(attachment.screenshotContentType);
    return `data:${contentType};base64,${attachment.screenshot}`;
  }
  return null;
}

export function resolveMessageScreenshotSrcList(message) {
  const screenshotSources = [];
  if (Array.isArray(message?.screenshots) && message.screenshots.length > 0) {
    for (const screenshotAttachment of message.screenshots) {
      const src = resolveAttachmentSrc(screenshotAttachment);
      if (src) {
        screenshotSources.push(src);
      }
    }
  }

  if (screenshotSources.length > 0) {
    return screenshotSources;
  }

  const fallbackSrc = resolveAttachmentSrc({
    screenshotUrl: message?.screenshotUrl,
    screenshotRef: message?.screenshotRef,
    screenshot: message?.screenshot,
    screenshotContentType: message?.screenshotContentType,
  });
  return fallbackSrc ? [fallbackSrc] : [];
}

export function hasMessageScreenshot(message) {
  return resolveMessageScreenshotSrcList(message).length > 0;
}

export function isUserMessageWithScreenshot(message) {
  return message?.sender === 'user' && hasMessageScreenshot(message);
}

export function resolveMessageScreenshotSrc(message) {
  return resolveMessageScreenshotSrcList(message)[0] || null;
}
