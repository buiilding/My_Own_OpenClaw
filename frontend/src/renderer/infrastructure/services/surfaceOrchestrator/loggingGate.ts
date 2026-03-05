declare global {
  interface Window {
    __WINDIE_VERBOSE_TOOL_LOGS__?: boolean;
  }
}

export function shouldLogSurfaceTransitions(): boolean {
  if (typeof window !== 'undefined' && typeof window.__WINDIE_VERBOSE_TOOL_LOGS__ === 'boolean') {
    return window.__WINDIE_VERBOSE_TOOL_LOGS__;
  }
  return !(
    typeof process !== 'undefined'
    && process.env
    && (process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'test')
  );
}
