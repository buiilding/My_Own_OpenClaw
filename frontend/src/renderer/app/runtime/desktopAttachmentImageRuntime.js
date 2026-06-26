/**
 * Resolves SDK attachment image sources, including asynchronous artifact images.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { DesktopArtifactRuntimeClient } from './desktopArtifactRuntimeClient';
import { DesktopSdkDisplayAttachmentProjection } from './desktopSdkDisplayAttachmentProjection';
import { normalizeNonEmptyString } from '../../utils/normalizeNonEmptyString';

const MAX_ATTACHMENT_IMAGE_SOURCE_CACHE_ENTRIES = 100;

const artifactImagePromiseCache = new Map();
const artifactImageSourceCache = new Map();
const {
  readSdkImageAttachmentSource,
} = DesktopSdkDisplayAttachmentProjection;

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

function buildArtifactCacheKey(imageSource) {
  if (!imageSource) {
    return null;
  }
  if (typeof imageSource.artifactId === 'string' && imageSource.artifactId.trim()) {
    return imageSource.artifactId.trim();
  }
  return DesktopArtifactRuntimeClient.inferArtifactRefFromUrl(imageSource.url);
}

function cachedArtifactAttachmentSrc(imageSource) {
  const cacheKey = buildArtifactCacheKey(imageSource);
  return cacheKey ? artifactImageSourceCache.get(cacheKey) ?? null : null;
}

async function resolveArtifactAttachmentSrc(imageSource) {
  const cacheKey = buildArtifactCacheKey(imageSource);
  if (!cacheKey) {
    return null;
  }

  let pending = artifactImagePromiseCache.get(cacheKey);
  if (!pending) {
    pending = DesktopArtifactRuntimeClient.fetchArtifactImage({
      artifactId: imageSource.artifactId || null,
      url: imageSource.url || null,
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

function resolveStaticAttachmentImageSrc(imageSource) {
  if (!imageSource) {
    return null;
  }
  const normalizedUrl = normalizeNonEmptyString(imageSource.url);
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

function useResolvedAttachmentImageSrc(attachment) {
  const attachmentIdentityNonce = useAttachmentIdentityNonce(attachment);
  const imageSource = useMemo(
    () => readSdkImageAttachmentSource(attachment),
    [attachment],
  );
  const [resolvedSrc, setResolvedSrc] = useState(
    resolveStaticAttachmentImageSrc(imageSource)
    || cachedArtifactAttachmentSrc(imageSource)
    || null,
  );

  useEffect(() => {
    let cancelled = false;
    const retryNonce = attachmentIdentityNonce;
    void retryNonce;
    const staticSrc = resolveStaticAttachmentImageSrc(imageSource);
    if (staticSrc) {
      setResolvedSrc((currentSrc) => (currentSrc === staticSrc ? currentSrc : staticSrc));
      return () => {
        cancelled = true;
      };
    }
    const cachedSrc = cachedArtifactAttachmentSrc(imageSource);
    if (cachedSrc) {
      setResolvedSrc((currentSrc) => (currentSrc === cachedSrc ? currentSrc : cachedSrc));
      return () => {
        cancelled = true;
      };
    }
    const cacheKey = buildArtifactCacheKey(imageSource);
    if (!cacheKey) {
      setResolvedSrc((currentSrc) => (currentSrc === null ? currentSrc : null));
      return () => {
        cancelled = true;
      };
    }
    setResolvedSrc((currentSrc) => (currentSrc === null ? currentSrc : null));
    void resolveArtifactAttachmentSrc(imageSource).then((src) => {
      if (!cancelled) {
        setResolvedSrc((currentSrc) => (currentSrc === src ? currentSrc : src));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [attachmentIdentityNonce, imageSource]);

  return resolvedSrc;
}

export const DesktopAttachmentImageRuntime = Object.freeze({
  useResolvedAttachmentImageSrc,
});
