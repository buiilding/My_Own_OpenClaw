/**
 * Resolves SDK attachment image sources, including asynchronous artifact images.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { DesktopArtifactRuntimeClient } from './desktopArtifactRuntimeClient';
import { normalizeNonEmptyString } from '../../utils/normalizeNonEmptyString';

const MAX_ATTACHMENT_IMAGE_SOURCE_CACHE_ENTRIES = 100;

const artifactImagePromiseCache = new Map();
const artifactImageSourceCache = new Map();
const SDK_IMAGE_ATTACHMENT_SOURCES = new Set([
  'user_included',
  'camera_button',
  'tool_result',
  'replay',
]);
const SDK_IMAGE_ATTACHMENT_STATUSES = new Set([
  'materializing',
  'ready',
]);

function rememberBoundedCacheEntry(cache, key, value) {
  if (!key) {
    return;
  }
  if (cache.has(key)) {
    cache.delete(key);
  }
  cache.set(key, value);
  while (cache.size > MAX_ATTACHMENT_IMAGE_SOURCE_CACHE_ENTRIES) {
    const oldestKey = cache.keys().next().value;
    cache.delete(oldestKey);
  }
}

function buildArtifactCacheKey(attachment) {
  if (!isSdkImageAttachment(attachment)) {
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

function resolveStaticAttachmentImageSrc(attachment) {
  if (!isSdkImageAttachment(attachment)) {
    return null;
  }
  const normalizedUrl = normalizeNonEmptyString(attachment.screenshotUrl);
  if (normalizedUrl && !DesktopArtifactRuntimeClient.inferArtifactRefFromUrl(normalizedUrl)) {
    return normalizedUrl;
  }
  return null;
}

function isSdkImageAttachment(attachment) {
  return Boolean(
    attachment
      && typeof attachment === 'object'
      && typeof attachment.id === 'string'
      && attachment.id.trim().length > 0
      && attachment.kind === 'image'
      && SDK_IMAGE_ATTACHMENT_SOURCES.has(attachment.source)
      && SDK_IMAGE_ATTACHMENT_STATUSES.has(attachment.status),
  );
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

function useResolvedAttachmentImageSrc(attachment) {
  const id = attachment?.id ?? null;
  const kind = attachment?.kind ?? null;
  const source = attachment?.source ?? null;
  const status = attachment?.status ?? null;
  const screenshotRef = attachment?.screenshotRef ?? null;
  const screenshotUrl = attachment?.screenshotUrl ?? null;
  const screenshotContentType = attachment?.contentType ?? attachment?.screenshotContentType ?? null;
  const attachmentIdentityNonce = useAttachmentIdentityNonce(attachment);
  const normalizedAttachment = useMemo(() => ({
    id,
    kind,
    source,
    status,
    screenshotRef,
    screenshotUrl,
    screenshotContentType,
  }), [id, kind, source, status, screenshotRef, screenshotUrl, screenshotContentType]);
  const [resolvedSrc, setResolvedSrc] = useState(
    resolveStaticAttachmentImageSrc(normalizedAttachment)
    || cachedArtifactAttachmentSrc(normalizedAttachment)
    || null,
  );

  useEffect(() => {
    let cancelled = false;
    const retryNonce = attachmentIdentityNonce;
    void retryNonce;
    const staticSrc = resolveStaticAttachmentImageSrc(normalizedAttachment);
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

export const DesktopAttachmentImageRuntime = Object.freeze({
  useResolvedAttachmentImageSrc,
});
