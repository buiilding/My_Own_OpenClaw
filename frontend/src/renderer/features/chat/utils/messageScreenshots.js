import { normalizeArtifactImageContentType } from '../../../infrastructure/services/ArtifactImageUtils';

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

  if (message?.screenshot) {
    const contentType = normalizeArtifactImageContentType(message.screenshotContentType);
    return `data:${contentType};base64,${message.screenshot}`;
  }

  return null;
}
