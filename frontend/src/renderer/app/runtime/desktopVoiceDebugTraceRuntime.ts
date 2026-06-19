/**
 * Provides gated voice debug tracing for the renderer runtime.
 */

type VoiceTraceDetails = Record<string, unknown>;

function isVoiceDebugTraceEnabled(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  const params = new URLSearchParams(window.location?.search || '');
  return params.get('debug_voice') === '1';
}

export function logVoiceDebugTrace(stage: string, details: VoiceTraceDetails = {}): void {
  if (!isVoiceDebugTraceEnabled()) {
    return;
  }
  console.log(`[VoiceTrace][renderer][${stage}]`, details);
}
