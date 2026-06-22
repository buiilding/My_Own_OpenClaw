/**
 * Resolves message screenshot sources, including asynchronous artifact images.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { DesktopArtifactRuntimeClient } from './desktopArtifactRuntimeClient';
import { normalizeNonEmptyString } from '../../utils/normalizeNonEmptyString';

const MAX_SCREENSHOT_SOURCE_CACHE_ENTRIES = 100;

const artifactImagePromiseCache = new Map();
const artifactImageSourceCache = new Map();

function rememberBoundedCacheEntry(cache, key, value) {
  if (!key) {
    return;
  }
  if (cache.has(key)) {
    cache.delete(key);
  }
  cache.set(key, value);
  while (cache.size > MAX_SCREENSHOT_SOURCE_CACHE_ENTRIES) {
    const oldestKey = cache.keys().next().value;
    cache.delete(oldestKey);
  }
}

function buildArtifactCacheKey(attachment) {
  if (!attachment || typeof attachment !== 'object') {
    return null;
  }
  if (typeof attachment.screenshotRef === 'string' && attachment.screenshotRef.trim()) {
    return attachment.screenshotRef.trim();
  }
  return DesktopArtifactRuntimeClient.inferArtifactRefFromUrl(attachment.screenshotUrl);
}

function cachedArtifactAttachmentSrc(attachment) {
  const cacheKey = buildArtifactCacheKey(attachment);
  return cacheKey ? artifactImageSourceCache.get(cacheKey) ?? null : null;
}

async function resolveArtifactAttachmentSrc(attachment) {
  const cacheKey = buildArtifactCacheKey(attachment);
  if (!cacheKey) {
    return null;
  }

  let pending = artifactImagePromiseCache.get(cacheKey);
  if (!pending) {
    pending = DesktopArtifactRuntimeClient.fetchArtifactImage({
      artifactId: attachment.screenshotRef || null,
      url: attachment.screenshotUrl || null,
    })
      .then((result) => (
        result?.success === true
        && typeof result.dataUrl === 'string'
        && result.dataUrl.trim()
      )
        ? result.dataUrl.trim()
        : null)
      .then((dataUrl) => {
        if (!dataUrl) {
          artifactImagePromiseCache.delete(cacheKey);
        } else {
          rememberBoundedCacheEntry(artifactImageSourceCache, cacheKey, dataUrl);
        }
        return dataUrl;
      })
      .catch(() => {
        artifactImagePromiseCache.delete(cacheKey);
        return null;
      });
    artifactImagePromiseCache.set(cacheKey, pending);
  }
  return pending;
}

function resolveStaticScreenshotAttachmentSrc(attachment) {
  if (!attachment || typeof attachment !== 'object') {
    return null;
  }
  const normalizedUrl = normalizeNonEmptyString(attachment.screenshotUrl);
  if (normalizedUrl && !DesktopArtifactRuntimeClient.inferArtifactRefFromUrl(normalizedUrl)) {
    return normalizedUrl;
  }
  return null;
}

function useAttachmentIdentityNonce(attachment) {
  const previousAttachmentRef = useRef(attachment);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (previousAttachmentRef.current === attachment) {
      return;
    }
    previousAttachmentRef.current = attachment;
    setNonce((currentNonce) => currentNonce + 1);
  }, [attachment]);

  return nonce;
}

function useResolvedArtifactImageSrc(attachment) {
  const screenshotRef = attachment?.screenshotRef ?? null;
  const screenshotUrl = attachment?.screenshotUrl ?? null;
  const screenshotContentType = attachment?.contentType ?? attachment?.screenshotContentType ?? null;
  const attachmentIdentityNonce = useAttachmentIdentityNonce(attachment);
  const normalizedAttachment = useMemo(() => ({
    screenshotRef,
    screenshotUrl,
    screenshotContentType,
  }), [screenshotRef, screenshotUrl, screenshotContentType]);
  const [resolvedSrc, setResolvedSrc] = useState(
    resolveStaticScreenshotAttachmentSrc(normalizedAttachment)
    || cachedArtifactAttachmentSrc(normalizedAttachment)
    || null,
  );

  useEffect(() => {
    let cancelled = false;
    const retryNonce = attachmentIdentityNonce;
    void retryNonce;
    const staticSrc = resolveStaticScreenshotAttachmentSrc(normalizedAttachment);
    if (staticSrc) {
      setResolvedSrc((currentSrc) => (currentSrc === staticSrc ? currentSrc : staticSrc));
      return () => {
        cancelled = true;
      };
    }
    const cachedSrc = cachedArtifactAttachmentSrc(normalizedAttachment);
    if (cachedSrc) {
      setResolvedSrc((currentSrc) => (currentSrc === cachedSrc ? currentSrc : cachedSrc));
      return () => {
        cancelled = true;
      };
    }
    const cacheKey = buildArtifactCacheKey(normalizedAttachment);
    if (!cacheKey) {
      setResolvedSrc((currentSrc) => (currentSrc === null ? currentSrc : null));
      return () => {
        cancelled = true;
      };
    }
    setResolvedSrc((currentSrc) => (currentSrc === null ? currentSrc : null));
    void resolveArtifactAttachmentSrc(normalizedAttachment).then((src) => {
      if (!cancelled) {
        setResolvedSrc((currentSrc) => (currentSrc === src ? currentSrc : src));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [attachmentIdentityNonce, normalizedAttachment]);

  return resolvedSrc;
}

export const DesktopResolvedMessageScreenshotsRuntime = Object.freeze({
  useResolvedArtifactImageSrc,
});
