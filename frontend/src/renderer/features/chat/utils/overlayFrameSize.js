export function getRoundedFrameSize(element) {
  const rect = element?.getBoundingClientRect?.();
  if (!rect) {
    return null;
  }
  return {
    width: Math.max(1, Math.round(rect.width)),
    height: Math.max(1, Math.round(rect.height)),
  };
}
