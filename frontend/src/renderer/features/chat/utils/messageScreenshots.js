import { normalizeArtifactImageContentType } from '../../../infrastructure/services/ArtifactImageUtils';
import { buildArtifactUrl } from '../../../infrastructure/services/ArtifactUploader';

export function hasMessageScreenshot(message) {
  return Boolean(message?.screenshotUrl || message?.screenshotRef || message?.screenshot);
}

export function isUserMessageWithScreenshot(message) {
  return message?.sender === 'user' && hasMessageScreenshot(message);
}

export function resolveMessageScreenshotSrc(message) {
  if (message?.screenshotUrl) {
    return message.screenshotUrl;
  }

  if (message?.screenshotRef) {
    return buildArtifactUrl(message.screenshotRef);
  }

  if (message?.screenshot) {
    const contentType = normalizeArtifactImageContentType(message.screenshotContentType);
    return `data:${contentType};base64,${message.screenshot}`;
  }

  return null;
}
