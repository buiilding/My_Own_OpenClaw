/**
 * Resolves message screenshot sources, including asynchronous artifact images.
 */

import { useEffect, useMemo, useState } from 'react';
import { DesktopArtifactRuntimeClient } from './desktopArtifactRuntimeClient';
import {
  DesktopMessageScreenshotRuntime,
} from './desktopMessageScreenshotRuntime';

const {
  resolveMessageScreenshotAttachments,
  resolveStaticScreenshotAttachmentSrc,
} = DesktopMessageScreenshotRuntime;

const artifactImagePromiseCache = new Map();

function buildArtifactCacheKey(attachment) {
  if (!attachment || typeof attachment !== 'object') {
    return null;
  }
  if (typeof attachment.screenshotRef === 'string' && attachment.screenshotRef.trim()) {
    return attachment.screenshotRef.trim();
  }
  return DesktopArtifactRuntimeClient.inferArtifactRefFromUrl(attachment.screenshotUrl);
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
  const initialSources = useMemo(
    () => attachments
      .map((attachment) => resolveStaticScreenshotAttachmentSrc(attachment))
      .filter((source) => typeof source === 'string' && source.length > 0),
    [attachments],
  );
  const [resolvedSources, setResolvedSources] = useState(initialSources);

  useEffect(() => {
    let cancelled = false;
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
          return resolveArtifactAttachmentSrc(attachment);
        }),
      );
      if (cancelled) {
        return;
      }
      setResolvedSources(
        results.filter((source) => typeof source === 'string' && source.length > 0),
      );
    }

    setResolvedSources(initialSources);
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
