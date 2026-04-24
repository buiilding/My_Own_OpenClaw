import { useEffect, useMemo, useState } from 'react';
import { IpcBridge, INVOKE_CHANNELS } from '../../../../infrastructure/ipc/bridge';
import { inferArtifactRefFromUrl } from '../../../../infrastructure/services/screenshotMessageState';
import {
  resolveMessageScreenshotAttachments,
  resolveStaticScreenshotAttachmentSrc,
} from './messageScreenshots';

const artifactImagePromiseCache = new Map();

function buildArtifactCacheKey(attachment) {
  if (!attachment || typeof attachment !== 'object') {
    return null;
  }
  if (typeof attachment.screenshotRef === 'string' && attachment.screenshotRef.trim()) {
    return attachment.screenshotRef.trim();
  }
  return inferArtifactRefFromUrl(attachment.screenshotUrl);
}

async function resolveArtifactAttachmentSrc(attachment) {
  const cacheKey = buildArtifactCacheKey(attachment);
  if (!cacheKey) {
    return null;
  }

  let pending = artifactImagePromiseCache.get(cacheKey);
  if (!pending) {
    pending = IpcBridge.invoke(INVOKE_CHANNELS.FETCH_ARTIFACT_IMAGE, {
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
      .catch(() => null);
    artifactImagePromiseCache.set(cacheKey, pending);
  }
  return pending;
}

export function useResolvedMessageScreenshotSrcList(message) {
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

export function useResolvedMessageScreenshotSrc(message) {
  return useResolvedMessageScreenshotSrcList(message)[0] || null;
}
