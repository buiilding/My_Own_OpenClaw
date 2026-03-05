import {
  parseBase64ImageDataUrl,
  readFileAsDataUrl,
} from './dataUrlImageUtils';

const IMAGE_FILE_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.bmp',
  '.tif',
  '.tiff',
  '.ico',
  '.svg',
]);

function buildAttachmentId(prefix = 'attachment') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeFilename(filename, fallback = 'attachment') {
  if (typeof filename !== 'string') {
    return fallback;
  }
  const trimmed = filename.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

function extractExtension(filename) {
  const normalizedFilename = normalizeFilename(filename, '');
  const lastDotIndex = normalizedFilename.lastIndexOf('.');
  if (lastDotIndex < 0) {
    return '';
  }
  return normalizedFilename.slice(lastDotIndex).toLowerCase();
}

function isImageFile(file) {
  const contentType = typeof file?.type === 'string' ? file.type.toLowerCase() : '';
  if (contentType.startsWith('image/')) {
    return true;
  }
  const extension = extractExtension(file?.name);
  return IMAGE_FILE_EXTENSIONS.has(extension);
}

function parseDataUrlAttachmentImage(dataUrl, fallbackContentType = null, filename = null) {
  const parsedImage = parseBase64ImageDataUrl(dataUrl, fallbackContentType);
  if (!parsedImage) {
    return null;
  }
  const normalizedFilename = normalizeFilename(
    filename,
    `attachment-image.${parsedImage.extension}`,
  );

  return {
    id: buildAttachmentId('image'),
    base64: parsedImage.base64,
    contentType: parsedImage.contentType,
    filename: normalizedFilename,
    previewUrl: parsedImage.previewUrl,
  };
}

function resolveFilePath(file) {
  const candidatePathValues = [
    file?.path,
    file?.filepath,
    file?.webkitRelativePath,
  ];
  for (const candidate of candidatePathValues) {
    if (typeof candidate !== 'string') {
      continue;
    }
    const normalized = candidate.trim();
    if (normalized.length > 0) {
      return normalized;
    }
  }
  return null;
}

export async function parseSelectedComposerFiles(fileList = []) {
  const files = Array.from(fileList || []);
  if (files.length === 0) {
    return {
      imageAttachments: [],
      readableFiles: [],
    };
  }

  const imageAttachments = [];
  const readableFiles = [];

  for (const file of files) {
    const filename = normalizeFilename(file?.name);
    if (isImageFile(file)) {
      const dataUrl = await readFileAsDataUrl(file, {
        loadErrorMessage: 'Failed to load attachment preview data.',
        readErrorMessage: 'Failed to read attachment file.',
      });
      const parsedImage = parseDataUrlAttachmentImage(dataUrl, file?.type || null, filename);
      if (parsedImage) {
        imageAttachments.push(parsedImage);
      }
      continue;
    }

    const filePath = resolveFilePath(file);
    if (!filePath) {
      continue;
    }

    readableFiles.push({
      id: buildAttachmentId('file'),
      filename,
      filePath,
    });
  }

  return {
    imageAttachments,
    readableFiles,
  };
}
