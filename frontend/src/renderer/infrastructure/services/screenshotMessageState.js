/**
 * Provides the screenshot message state module for the renderer UI.
 */

import { buildRuntimeArtifactUrl } from './RuntimeEndpointStore';
import { normalizeNonEmptyString } from '../../utils/normalizeNonEmptyString';

export function inferArtifactRefFromUrl(url) {
  const normalizedUrl = normalizeNonEmptyString(url);
  if (!normalizedUrl) {
    return null;
  }
  const match = normalizedUrl.match(/\/api\/artifacts\/([^/?#]+)/i);
  return match?.[1] || null;
}

function parseInlineScreenshotPayload(payload) {
  const normalizedPayload = normalizeNonEmptyString(payload);
  if (!normalizedPayload) {
    return null;
  }
  if (
    normalizedPayload.toLowerCase().startsWith('artifact://')
    || normalizedPayload.toLowerCase().startsWith('http://')
    || normalizedPayload.toLowerCase().startsWith('https://')
  ) {
    return null;
  }

  const dataUrlMatch = normalizedPayload.match(/^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i);
  if (dataUrlMatch) {
    return {
      base64: dataUrlMatch[2].trim(),
      contentType: dataUrlMatch[1].toLowerCase(),
    };
  }

  return {
    base64: normalizedPayload,
    contentType: null,
  };
}

function resolveArtifactUrlBuilder(options = {}) {
  return typeof options.artifactUrlBuilder === 'function'
    ? options.artifactUrlBuilder
    : buildRuntimeArtifactUrl;
}

export function buildRemoteScreenshotAttachment(
  screenshotRef,
  screenshotUrl,
  options = {},
) {
  const deriveUrlFromRef = options.deriveUrlFromRef !== false;
  const artifactUrlBuilder = resolveArtifactUrlBuilder(options);
  const normalizedRef = normalizeNonEmptyString(screenshotRef);
  const normalizedUrl = normalizeNonEmptyString(screenshotUrl);
  return {
    screenshotRef: normalizedRef,
    screenshotUrl: normalizedUrl || (
      normalizedRef && deriveUrlFromRef
        ? artifactUrlBuilder(normalizedRef)
        : null
    ),
  };
}

export function buildRemoteScreenshotAttachments(
  screenshotRefs,
  screenshotUrl,
  options = {},
) {
  const normalizedRefs = Array.isArray(screenshotRefs)
    ? screenshotRefs
      .map((ref) => normalizeNonEmptyString(ref))
      .filter((ref) => Boolean(ref))
    : [];

  if (normalizedRefs.length === 0) {
    const singleAttachment = buildRemoteScreenshotAttachment(null, screenshotUrl, options);
    return singleAttachment.screenshotUrl ? [singleAttachment] : [];
  }

  return normalizedRefs.map((ref, index) => (
    buildRemoteScreenshotAttachment(ref, index === 0 ? screenshotUrl : null, options)
  ));
}

export function resolveScreenshotAttachmentState({
  screenshot = null,
  screenshotRef = null,
  screenshotUrl = null,
  screenshotContentType = null,
  preserveInlineScreenshotWithRemote = true,
  deriveUrlFromRef = true,
  artifactUrlBuilder = undefined,
}) {
  const normalizedScreenshot = normalizeNonEmptyString(screenshot);
  const parsedInlineScreenshot = parseInlineScreenshotPayload(normalizedScreenshot);
  const remoteAttachment = buildRemoteScreenshotAttachment(
    normalizeNonEmptyString(screenshotRef) || inferArtifactRefFromUrl(screenshotUrl),
    screenshotUrl,
    { deriveUrlFromRef, artifactUrlBuilder },
  );
  const hasRemoteScreenshot = Boolean(remoteAttachment.screenshotRef || remoteAttachment.screenshotUrl);
  const resolvedContentType = (
    normalizeNonEmptyString(screenshotContentType)
    || parsedInlineScreenshot?.contentType
    || null
  );

  return {
    screenshot: (
      hasRemoteScreenshot && !preserveInlineScreenshotWithRemote
    )
      ? null
      : (parsedInlineScreenshot?.base64 || null),
    screenshotRef: remoteAttachment.screenshotRef,
    screenshotUrl: remoteAttachment.screenshotUrl,
    screenshotContentType: resolvedContentType,
    hasRemoteScreenshot,
  };
}

export function buildMessageScreenshotState({
  screenshot = null,
  screenshotRef = null,
  screenshotUrl = null,
  screenshotContentType = null,
  artifactUrlBuilder = undefined,
}) {
  const attachment = resolveScreenshotAttachmentState({
    screenshot,
    screenshotRef,
    screenshotUrl,
    screenshotContentType,
    artifactUrlBuilder,
    preserveInlineScreenshotWithRemote: false,
  });

  return {
    screenshot: attachment.screenshot,
    screenshotRef: attachment.screenshotRef,
    screenshotUrl: attachment.screenshotUrl,
    screenshotContentType: attachment.hasRemoteScreenshot
      ? null
      : attachment.screenshotContentType,
  };
}

export function resolveReplayScreenshotState({
  screenshot = null,
  screenshotRef = null,
  screenshotUrl = null,
  screenshotContentType = null,
  artifactUrlBuilder = undefined,
}) {
  const attachment = resolveScreenshotAttachmentState({
    screenshot,
    screenshotRef,
    screenshotUrl,
    screenshotContentType,
    artifactUrlBuilder,
    preserveInlineScreenshotWithRemote: false,
  });

  return {
    screenshot: attachment.screenshot,
    screenshotRef: attachment.screenshotRef,
    screenshotUrl: attachment.screenshotUrl,
    screenshotContentType: attachment.screenshotContentType,
  };
}
