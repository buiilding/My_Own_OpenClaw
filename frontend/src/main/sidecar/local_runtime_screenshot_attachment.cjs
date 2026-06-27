/**
 * Bridges local runtime screenshot attachment behavior for the Electron main process.
 */

const fsPromises = require('fs/promises');
const os = require('os');
const path = require('path');
const {
  materializeVisualResource,
} = require('../../../packages/windie-sdk-js/cjs/runtime/VisualResourceMaterializer.js');

const SCREENSHOT_TEMP_DIR_NAME = 'desktop-runtime-screenshots';
const SCREENSHOT_TEMP_FILE_PREFIX = 'desktop-runtime-shot-';
const LOCAL_RUNTIME_BRIDGE_LOG_PREFIX = '[Main][LocalRuntimeBridge]';

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isImageContentType(value) {
  return typeof value === 'string' && value.toLowerCase().startsWith('image/');
}

function resolveScreenshotContentType(data) {
  if (!isRecord(data)) {
    return 'image/jpeg';
  }
  if (isImageContentType(data.screenshot_content_type)) {
    return data.screenshot_content_type.toLowerCase();
  }
  if (isImageContentType(data.image_content_type)) {
    return data.image_content_type.toLowerCase();
  }

  const format = (
    typeof data.compression === 'string'
      ? data.compression
      : typeof data.format === 'string'
        ? data.format
        : ''
  ).toLowerCase();
  if (format === 'png') {
    return 'image/png';
  }
  if (format === 'webp') {
    return 'image/webp';
  }
  return 'image/jpeg';
}

function resolveScreenshotFilename(screenshotPath, contentType) {
  const basename = path.basename(screenshotPath || '');
  if (basename && basename.includes('.')) {
    return basename;
  }
  if (contentType === 'image/png') {
    return 'screenshot.png';
  }
  if (contentType === 'image/webp') {
    return 'screenshot.webp';
  }
  return 'screenshot.jpg';
}

async function uploadTrustedScreenshotArtifact({
  screenshotPath,
  backendHttpUrl,
  contentType,
  headers,
  captureMeta,
}) {
  const resolvedContentType = isImageContentType(contentType) ? contentType : 'image/jpeg';
  const fileBuffer = await fsPromises.readFile(screenshotPath);
  return materializeVisualResource({
    source: 'trusted_temp_screenshot_path',
    bytes: fileBuffer,
    contentType: resolvedContentType,
    filename: resolveScreenshotFilename(screenshotPath, resolvedContentType),
    captureMeta: isRecord(captureMeta) ? captureMeta : null,
  }, {
    artifactUploader: {
      async upload(file, filename) {
        const form = new FormData();
        form.append('file', file, filename || resolveScreenshotFilename(screenshotPath, resolvedContentType));

        const response = await fetch(`${backendHttpUrl}/api/artifacts/`, {
          method: 'POST',
          headers: isRecord(headers) ? headers : undefined,
          body: form,
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Upload failed (${response.status}): ${errorText}`);
        }

        return response.json();
      },
      url: artifactId => `${backendHttpUrl}/api/artifacts/${artifactId}`,
    },
  });
}

async function readScreenshotInlinePayload(screenshotPath) {
  const fileBuffer = await fsPromises.readFile(screenshotPath);
  return fileBuffer.toString('base64');
}

async function unlinkQuietly(targetPath, warn = console.warn) {
  if (!targetPath) {
    return;
  }
  try {
    await fsPromises.unlink(targetPath);
  } catch (error) {
    if (error && error.code !== 'ENOENT') {
      warn(`${LOCAL_RUNTIME_BRIDGE_LOG_PREFIX} temp_screenshot_delete_failed path=${JSON.stringify(targetPath)}`, error);
    }
  }
}

function resolveOwnedScreenshotTempDir() {
  return path.join(os.tmpdir(), SCREENSHOT_TEMP_DIR_NAME);
}

async function isOwnedScreenshotPath(screenshotPath, warn, getErrorMessage) {
  if (typeof screenshotPath !== 'string' || !path.isAbsolute(screenshotPath)) {
    return false;
  }

  const normalizedPath = path.resolve(screenshotPath);
  const screenshotDir = path.resolve(resolveOwnedScreenshotTempDir());
  if (path.dirname(normalizedPath) !== screenshotDir) {
    return false;
  }
  const basename = path.basename(normalizedPath);
  if (!basename.startsWith(SCREENSHOT_TEMP_FILE_PREFIX)) {
    return false;
  }

  try {
    await fsPromises.mkdir(screenshotDir, { recursive: true, mode: 0o700 });
    const [dirRealpath, parentRealpath, stat] = await Promise.all([
      fsPromises.realpath(screenshotDir),
      fsPromises.realpath(path.dirname(normalizedPath)),
      fsPromises.lstat(normalizedPath),
    ]);
    return parentRealpath === dirRealpath && stat.isFile() && !stat.isSymbolicLink();
  } catch (error) {
    warn(
      `${LOCAL_RUNTIME_BRIDGE_LOG_PREFIX} screenshot_temp_path_rejected path=${JSON.stringify(screenshotPath)} message=${JSON.stringify(getErrorMessage(error))}`,
    );
    return false;
  }
}

async function materializeScreenshotAttachment(result, backendHttpUrl, options = {}) {
  const warn = typeof options.warn === 'function' ? options.warn : console.warn;
  const getErrorMessage = typeof options.getErrorMessage === 'function'
    ? options.getErrorMessage
    : ((error) => error instanceof Error ? error.message : String(error));
  const getArtifactUploadHeaders = typeof options.getArtifactUploadHeaders === 'function'
    ? options.getArtifactUploadHeaders
    : null;

  if (!result || result.success === false || !isRecord(result.data)) {
    return result;
  }
  const data = result.data;
  const screenshotPath = typeof data.screenshot_path === 'string'
    ? data.screenshot_path.trim()
    : '';
  if (!screenshotPath) {
    return result;
  }
  if (!(await isOwnedScreenshotPath(screenshotPath, warn, getErrorMessage))) {
    warn(`${LOCAL_RUNTIME_BRIDGE_LOG_PREFIX} screenshot_temp_path_unowned path=${JSON.stringify(screenshotPath)}`);
    delete data.screenshot_path;
    return result;
  }

  try {
    const artifactUploadHeaders = getArtifactUploadHeaders
      ? await getArtifactUploadHeaders()
      : undefined;
    const materialized = await uploadTrustedScreenshotArtifact({
      screenshotPath,
      backendHttpUrl,
      contentType: resolveScreenshotContentType(data),
      headers: artifactUploadHeaders,
      captureMeta: data.capture_meta,
    });
    const artifactId = typeof materialized?.screenshot_ref === 'string'
      && materialized.screenshot_ref.trim()
      ? materialized.screenshot_ref.trim()
      : null;
    const artifactUrl = typeof materialized?.screenshot_url === 'string'
      && materialized.screenshot_url.trim()
      ? materialized.screenshot_url.trim()
      : null;

    if (artifactId) {
      data.screenshot_ref = artifactId;
      data.screenshot_url = artifactUrl || `${backendHttpUrl}/api/artifacts/${artifactId}`;
      if (typeof materialized.screenshot_content_type === 'string' && materialized.screenshot_content_type.trim()) {
        data.screenshot_content_type = materialized.screenshot_content_type.trim();
      }
    } else {
      data.screenshot = await readScreenshotInlinePayload(screenshotPath);
    }
  } catch (error) {
    warn(
      `${LOCAL_RUNTIME_BRIDGE_LOG_PREFIX} screenshot_artifact_upload_failed path=${JSON.stringify(screenshotPath)} message=${JSON.stringify(getErrorMessage(error))}`,
    );
    try {
      data.screenshot = await readScreenshotInlinePayload(screenshotPath);
    } catch (fallbackError) {
      warn(
        `${LOCAL_RUNTIME_BRIDGE_LOG_PREFIX} screenshot_inline_fallback_failed path=${JSON.stringify(screenshotPath)} message=${JSON.stringify(getErrorMessage(fallbackError))}`,
      );
    }
  } finally {
    await unlinkQuietly(screenshotPath, warn);
    delete data.screenshot_path;
  }

  return result;
}

module.exports = {
  materializeScreenshotAttachment,
};
