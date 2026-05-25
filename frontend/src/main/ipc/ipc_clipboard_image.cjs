const MAX_DATA_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_REMOTE_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_IMAGE_REDIRECTS = 3;

function normalizeOrigin(value) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return null;
  }
  try {
    return new URL(value.trim()).origin;
  } catch {
    return null;
  }
}

function resolveTrustedImageOrigins({
  trustedImageOrigins = [],
  getTrustedImageOrigins,
  backendHttpUrl,
} = {}) {
  const dynamicOrigins = typeof getTrustedImageOrigins === 'function'
    ? getTrustedImageOrigins()
    : [];
  return new Set([
    ...(Array.isArray(trustedImageOrigins) ? trustedImageOrigins : []),
    ...(Array.isArray(dynamicOrigins) ? dynamicOrigins : []),
    backendHttpUrl,
  ]
    .map((origin) => normalizeOrigin(origin))
    .filter(Boolean));
}

function isArtifactImagePath(url) {
  return /^\/api\/artifacts\/[^/?#]+/i.test(url.pathname);
}

function estimateDataUrlBytes(dataUrl) {
  const commaIndex = dataUrl.indexOf(',');
  if (commaIndex < 0) {
    return Buffer.byteLength(dataUrl);
  }
  const metadata = dataUrl.slice(0, commaIndex).toLowerCase();
  const payload = dataUrl.slice(commaIndex + 1).replace(/\s/g, '');
  if (metadata.includes(';base64')) {
    return Math.ceil((payload.length * 3) / 4);
  }
  return Buffer.byteLength(payload);
}

function validateDataImageSource(src, { maxDataUrlBytes = MAX_DATA_IMAGE_BYTES } = {}) {
  if (!src.toLowerCase().startsWith('data:image/')) {
    throw new Error('Only image data URLs can be copied.');
  }
  if (estimateDataUrlBytes(src) > maxDataUrlBytes) {
    throw new Error('Image data URL is too large to copy.');
  }
  return src;
}

function normalizeRemoteImageUrl(src, {
  backendHttpUrl,
} = {}) {
  try {
    if (src.startsWith('/api/artifacts/') && typeof backendHttpUrl === 'string' && backendHttpUrl.trim()) {
      return new URL(src, backendHttpUrl.trim());
    }
    return new URL(src);
  } catch {
    throw new Error('Image source URL is invalid.');
  }
}

function validateRemoteImageUrl(src, policy = {}) {
  const url = normalizeRemoteImageUrl(src, policy);
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('Image source URL scheme is not allowed.');
  }

  const trustedOrigins = resolveTrustedImageOrigins(policy);
  if (!trustedOrigins.has(url.origin) || !isArtifactImagePath(url)) {
    throw new Error('Image source URL is not a trusted Windie artifact image.');
  }
  return url.toString();
}

function validateImageContentType(response) {
  const contentType = typeof response?.headers?.get === 'function'
    ? String(response.headers.get('content-type') || '').toLowerCase()
    : '';
  if (!contentType.startsWith('image/')) {
    throw new Error('Fetched clipboard image did not return an image content type.');
  }
}

async function readBoundedImageBuffer(response, {
  maxRemoteImageBytes = MAX_REMOTE_IMAGE_BYTES,
} = {}) {
  const contentLength = typeof response?.headers?.get === 'function'
    ? Number(response.headers.get('content-length'))
    : NaN;
  if (Number.isFinite(contentLength) && contentLength > maxRemoteImageBytes) {
    throw new Error('Fetched clipboard image is too large to copy.');
  }

  const imageBuffer = Buffer.from(await response.arrayBuffer());
  if (imageBuffer.length > maxRemoteImageBytes) {
    throw new Error('Fetched clipboard image is too large to copy.');
  }
  return imageBuffer;
}

async function fetchTrustedImageResponse({
  src,
  fetchImpl,
  maxRedirects = MAX_IMAGE_REDIRECTS,
  ...policy
}) {
  let currentUrl = validateRemoteImageUrl(src, policy);
  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
    const response = await fetchImpl(currentUrl, { redirect: 'manual' });
    const status = Number(response?.status);
    if (status >= 300 && status < 400) {
      const location = typeof response?.headers?.get === 'function'
        ? response.headers.get('location')
        : null;
      if (!location) {
        throw new Error('Image fetch redirect did not include a location.');
      }
      if (redirectCount >= maxRedirects) {
        throw new Error('Image fetch redirected too many times.');
      }
      currentUrl = validateRemoteImageUrl(new URL(location, currentUrl).toString(), policy);
      continue;
    }
    return response;
  }
  throw new Error('Image fetch redirected too many times.');
}

async function copyImageToClipboard({
  src,
  clipboard,
  nativeImage,
  fetchImpl = globalThis.fetch,
  trustedImageOrigins = [],
  getTrustedImageOrigins,
  backendHttpUrl,
  maxDataUrlBytes = MAX_DATA_IMAGE_BYTES,
  maxRemoteImageBytes = MAX_REMOTE_IMAGE_BYTES,
  maxRedirects = MAX_IMAGE_REDIRECTS,
}) {
  if (typeof src !== 'string' || src.trim().length === 0) {
    throw new Error('Image source is required.');
  }

  if (!clipboard || typeof clipboard.writeImage !== 'function') {
    throw new Error('Clipboard image support is unavailable.');
  }

  if (!nativeImage) {
    throw new Error('Native image support is unavailable.');
  }

  const normalizedSrc = src.trim();
  let image = null;

  if (normalizedSrc.startsWith('data:image/')) {
    if (typeof nativeImage.createFromDataURL !== 'function') {
      throw new Error('Clipboard data URL decoding is unavailable.');
    }
    image = nativeImage.createFromDataURL(validateDataImageSource(normalizedSrc, {
      maxDataUrlBytes,
    }));
  } else {
    if (typeof fetchImpl !== 'function') {
      throw new Error('Image fetch support is unavailable.');
    }
    if (typeof nativeImage.createFromBuffer !== 'function') {
      throw new Error('Clipboard buffer decoding is unavailable.');
    }

    const response = await fetchTrustedImageResponse({
      src: normalizedSrc,
      fetchImpl,
      trustedImageOrigins,
      getTrustedImageOrigins,
      backendHttpUrl,
      maxRedirects,
    });
    if (!response || response.ok !== true) {
      throw new Error(`Failed to fetch image for clipboard copy (${response?.status || 'unknown'}).`);
    }
    validateImageContentType(response);

    const imageBuffer = await readBoundedImageBuffer(response, {
      maxRemoteImageBytes,
    });
    image = nativeImage.createFromBuffer(imageBuffer);
  }

  if (!image || (typeof image.isEmpty === 'function' && image.isEmpty())) {
    throw new Error('Failed to decode image for clipboard copy.');
  }

  clipboard.writeImage(image);
  return { success: true };
}

function registerClipboardImageHandler({
  ipcMain,
  clipboard,
  nativeImage,
  fetchImpl = globalThis.fetch,
  trustedImageOrigins = [],
  getTrustedImageOrigins,
  backendHttpUrl,
}) {
  ipcMain.handle('copy-image-to-clipboard', async (_event, payload = {}) => {
    try {
      return await copyImageToClipboard({
        src: payload?.src,
        clipboard,
        nativeImage,
        fetchImpl,
        trustedImageOrigins,
        getTrustedImageOrigins,
        backendHttpUrl,
      });
    } catch (error) {
      return {
        success: false,
        error: String(error?.message || error || 'Failed to copy image to clipboard.'),
      };
    }
  });
}

module.exports = {
  MAX_DATA_IMAGE_BYTES,
  MAX_REMOTE_IMAGE_BYTES,
  copyImageToClipboard,
  registerClipboardImageHandler,
  validateRemoteImageUrl,
};
