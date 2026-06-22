/**
 * Resolves message screenshot sources, including asynchronous artifact images.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { DesktopArtifactRuntimeClient } from './desktopArtifactRuntimeClient';
import {
  DesktopMessageScreenshotRuntime,
} from './desktopMessageScreenshotRuntime';

const {
  resolveMessageScreenshotAttachments,
  resolveStaticScreenshotAttachmentSrc,
} = DesktopMessageScreenshotRuntime;

const MAX_SCREENSHOT_SOURCE_CACHE_ENTRIES = 100;

const artifactImagePromiseCache = new Map();
const artifactImageSourceCache = new Map();
const messageScreenshotSourceCache = new Map();

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

function normalizeContinuityKey(value) {
  return typeof value === 'string' && value.trim()
    ? value.trim()
    : null;
}

function messageScreenshotContinuityKey(message) {
  if (!message || typeof message !== 'object') {
    return null;
  }
  return normalizeContinuityKey(message.turnRef)
    ?? normalizeContinuityKey(message.id)
    ?? null;
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

function useResolvedMessageScreenshotSrcList(message) {
  const attachments = useMemo(() => resolveMessageScreenshotAttachments(message), [message]);
  const continuityKey = useMemo(() => messageScreenshotContinuityKey(message), [message]);
  const initialSources = useMemo(
    () => {
      const staticOrCachedSources = attachments
        .map((attachment) => (
          resolveStaticScreenshotAttachmentSrc(attachment)
          || cachedArtifactAttachmentSrc(attachment)
        ))
        .filter((source) => typeof source === 'string' && source.length > 0);
      if (staticOrCachedSources.length > 0) {
        return staticOrCachedSources;
      }
      return continuityKey ? messageScreenshotSourceCache.get(continuityKey) ?? [] : [];
    },
    [attachments, continuityKey],
  );
  const [resolvedSources, setResolvedSources] = useState(initialSources);
  const previousContinuityKeyRef = useRef(continuityKey);

  useEffect(() => {
    if (continuityKey && resolvedSources.length > 0) {
      rememberBoundedCacheEntry(messageScreenshotSourceCache, continuityKey, resolvedSources);
    }
  }, [continuityKey, resolvedSources]);

  useEffect(() => {
    let cancelled = false;
    const previousContinuityKey = previousContinuityKeyRef.current;
    previousContinuityKeyRef.current = continuityKey;
    const isSameMessageContinuity = (
      previousContinuityKey !== null
      && continuityKey !== null
      && previousContinuityKey === continuityKey
    );
    const needsArtifactResolution = attachments.some(
      (attachment) => !resolveStaticScreenshotAttachmentSrc(attachment),
    );

    if (!needsArtifactResolution) {
      setResolvedSources(initialSources);
      return () => {
        cancelled = true;
      };
    }

    async function resolveSources() {
      const results = await Promise.all(
        attachments.map(async (attachment) => {
          const staticSrc = resolveStaticScreenshotAttachmentSrc(attachment);
          if (staticSrc) {
            return staticSrc;
          }
          const cachedSrc = cachedArtifactAttachmentSrc(attachment);
          if (cachedSrc) {
            return cachedSrc;
          }
          return resolveArtifactAttachmentSrc(attachment);
        }),
      );
      if (cancelled) {
        return;
      }
      const nextSources = results.filter((source) => typeof source === 'string' && source.length > 0);
      if (continuityKey && nextSources.length > 0) {
        rememberBoundedCacheEntry(messageScreenshotSourceCache, continuityKey, nextSources);
      }
      setResolvedSources(nextSources);
    }

    if (initialSources.length > 0 || !isSameMessageContinuity) {
      setResolvedSources(initialSources);
    }
    void resolveSources();

    return () => {
      cancelled = true;
    };
  }, [attachments, initialSources]);

  return resolvedSources;
}

function useResolvedMessageScreenshotSrc(message) {
  return useResolvedMessageScreenshotSrcList(message)[0] || null;
}

export const DesktopResolvedMessageScreenshotsRuntime = Object.freeze({
  useResolvedMessageScreenshotSrc,
  useResolvedMessageScreenshotSrcList,
});
