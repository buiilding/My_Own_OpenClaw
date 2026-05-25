function hasStablePreviewId(id) {
  return typeof id === 'string' && id.trim() !== '';
}

function removePreviewAttachmentByIdOrIndex(items, id, fallbackIndex) {
  if (!Array.isArray(items)) {
    return [];
  }
  if (hasStablePreviewId(id)) {
    return items.filter((item) => item?.id !== id);
  }
  if (!Number.isInteger(fallbackIndex) || fallbackIndex < 0) {
    return items;
  }
  return items.filter((_item, index) => index !== fallbackIndex);
}

export { removePreviewAttachmentByIdOrIndex };
