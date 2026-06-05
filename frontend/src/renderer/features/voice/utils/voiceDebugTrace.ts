type VoiceTraceDetails = Record<string, unknown>;

export function isVoiceDebugTraceEnabled(): boolean {
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
