function getRendererSearch(): string {
  if (typeof window === 'undefined') {
    return '';
  }
  return typeof window.location?.search === 'string' ? window.location.search : '';
}

function isRendererToolScreenshotDebugEnabled(): boolean {
  return getRendererSearch().includes('debug_tool_screenshot=1');
}

export function logRendererToolScreenshotDebug(
  stage: string,
  payload: Record<string, unknown>,
): void {
  if (!isRendererToolScreenshotDebugEnabled()) {
    return;
  }
  console.log('[ToolShotDebug][renderer]', stage, payload);
}

export function logRendererArtifactScreenshotDebug(
  stage: string,
  payload: Record<string, unknown>,
): void {
  if (!isRendererToolScreenshotDebugEnabled()) {
    return;
  }
  console.log('[ToolShotDebug][renderer][artifact]', stage, payload);
}
