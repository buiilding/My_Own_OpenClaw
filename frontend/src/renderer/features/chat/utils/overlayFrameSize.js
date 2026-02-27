export function getRoundedFrameSize(element) {
  const rect = element?.getBoundingClientRect?.();
  if (!rect) {
    return null;
  }
  const rectWidth = Number(rect.width) || 0;
  const rectHeight = Number(rect.height) || 0;
  const scrollWidth = Number(element?.scrollWidth) || 0;
  const scrollHeight = Number(element?.scrollHeight) || 0;
  const offsetWidth = Number(element?.offsetWidth) || 0;
  const offsetHeight = Number(element?.offsetHeight) || 0;
  return {
    // Use ceil + structural box metrics to avoid 1px under-measure clipping.
    width: Math.max(1, Math.ceil(Math.max(rectWidth, scrollWidth, offsetWidth))),
    height: Math.max(1, Math.ceil(Math.max(rectHeight, scrollHeight, offsetHeight))),
  };
}
