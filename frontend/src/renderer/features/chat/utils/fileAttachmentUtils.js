import {
  normalizeArtifactImageContentType,
  resolveArtifactImageExtension,
} from '../../../infrastructure/services/ArtifactImageUtils';

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

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
        return;
      }
      reject(new Error('Failed to load attachment preview data.'));
    };
    reader.onerror = () => {
      reject(reader.error || new Error('Failed to read attachment file.'));
    };
    reader.readAsDataURL(file);
  });
}

function parseDataUrlAttachmentImage(dataUrl, fallbackContentType = null, filename = null) {
  const match = /^data:([^;]+);base64,(.+)$/i.exec(dataUrl);
  if (!match) {
    return null;
  }
  const contentType = normalizeArtifactImageContentType(match[1] || fallbackContentType);
  const extension = resolveArtifactImageExtension(contentType);
  const normalizedFilename = normalizeFilename(filename, `attachment-image.${extension}`);

  return {
    id: buildAttachmentId('image'),
    base64: match[2],
    contentType,
    filename: normalizedFilename,
    previewUrl: dataUrl,
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
      const dataUrl = await readFileAsDataUrl(file);
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
